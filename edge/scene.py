"""Turns per-frame boxes into doorstep events: approached, lingering, touched, removed, left."""
import cv2
import numpy as np

NEAR = 120           # px around the package that counts as "at the package"
LEFT_AFTER = 2.0     # s unseen before a person counts as gone
GONE_AFTER = 0.6     # s the package spot must look empty before we call it removed
EMPTY_DIFF = 25      # how different the spot must look from when the package was there


def overlaps(a, b, margin=0):
    return not (a[2] < b[0] - margin or a[0] > b[2] + margin
                or a[3] < b[1] - margin or a[1] > b[3] + margin)


class Scene:
    def __init__(self, linger_seconds=90, door=None):
        self.linger_seconds = linger_seconds
        self.door = door                 # [x1, y1, x2, y2] of the house entrance, if known
        self.package = None              # locked package box
        self.reference = None            # what the package spot looked like with the package in it
        self.package_state = None        # None -> 'present' -> 'removed'
        self.candidate = None            # first sighting, waiting for a second one to confirm
        self.empty_since = None
        self.people = {}                 # track id -> what we know about that person
        self.last_toucher = None

    # -- package -----------------------------------------------------------
    def wants_package_search(self):
        return self.package is None

    def offer_package(self, found, frame, t):
        """Lock the package after two sightings in the same place, one second apart."""
        if found is None:
            self.candidate = None
            return []
        if self.candidate and overlaps(self.candidate['box'], found['box']):
            self.package = found['box']
            self.reference = self._crop(frame)
            self.package_state = 'present'
            return [self._event(t, 'package_delivered', confidence=found['conf'])]
        self.candidate = found
        return []

    def _crop(self, frame):
        x1, y1, x2, y2 = self.package
        return cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY).astype(np.float32)

    # -- every frame ---------------------------------------------------------
    def update(self, things, frame, t):
        events = []
        people = [p for p in things if p['label'] == 'person' and p['id'] is not None]
        covering = False
        for person in people:
            events += self._update_person(person, t)
            if self.package and overlaps(person['box'], self.package):
                covering = True
        if self.package_state == 'present':
            events += self._check_package(frame, t, covering)
        events += self._check_departures(t)
        return events

    def _update_person(self, person, t):
        events = []
        info = self.people.setdefault(person['id'], {
            'first_box': person['box'], 'first_t': t, 'near_since': None,
            'approached': False, 'lingering': False, 'touched': False})
        info['last_box'], info['last_t'] = person['box'], t
        if not self.package:
            return events
        near = overlaps(person['box'], self.package, NEAR)
        if near and not info['approached']:
            info['approached'] = True
            events.append(self._event(t, 'person_approached', person))
        if near:
            info['near_since'] = info['near_since'] or t
            if not info['lingering'] and t - info['near_since'] >= self.linger_seconds:
                info['lingering'] = True
                events.append(self._event(t, 'person_lingering', person,
                                          duration_seconds=round(t - info['near_since'])))
        else:
            info['near_since'] = None
        if overlaps(person['box'], self.package) and not info['touched'] and self.package_state == 'present':
            info['touched'] = True
            self.last_toucher = person['id']
            from_door = self.door is not None and overlaps(info['first_box'], self.door)
            events.append(self._event(t, 'package_touched', person, came_from_door=from_door))
        return events

    def _check_package(self, frame, t, covering):
        # While someone stands over the spot we can't see it, so we don't judge.
        diff = float(np.mean(np.abs(self._crop(frame) - self.reference)))
        if covering or diff <= EMPTY_DIFF:
            self.empty_since = None
            return []
        self.empty_since = self.empty_since or t
        if t - self.empty_since < GONE_AFTER:
            return []
        self.package_state = 'removed'
        return [self._event(t, 'package_removed', person_id=self.last_toucher)]

    def _check_departures(self, t):
        events = []
        for person_id, info in list(self.people.items()):
            if t - info['last_t'] < LEFT_AFTER:
                continue
            went_inside = self.door is not None and overlaps(info['last_box'], self.door)
            took = info['touched'] and self.package_state == 'removed' and self.last_toucher == person_id
            kind = 'entered_home' if went_inside else 'person_left'
            events.append(self._event(info['last_t'], kind, person_id=person_id,
                                      carried_package=took,
                                      came_from_door=self.door is not None and overlaps(info['first_box'], self.door)))
            del self.people[person_id]
        return events

    def finish(self, t):
        """The feed ended: everyone still on record has left."""
        return self._check_departures(t + LEFT_AFTER)

    @staticmethod
    def _event(t, kind, person=None, person_id=None, **details):
        event = {'t': round(t, 1), 'kind': kind}
        if person:
            event['person_id'], event['box'] = person['id'], person['box']
        elif person_id is not None:
            event['person_id'] = person_id
        event.update(details)
        return event