"""DemaFur edge detector: watches a door camera, tracks people and the package, and reports doorstep events."""
import argparse
import json
import os
import uuid

import cv2

from bridge import Bridge
from detector import Detector
from scene import Scene
from source import Source
from porch import Porch
from stream import LiveStream

# OpenCV colours are BGR (blue, green, red).
COLOURS = {'person': (0, 200, 255), 'car': (255, 160, 0), 'package': (80, 220, 80)}
RED = (60, 60, 255)


def draw_box(frame, box, colour, text):
    x1, y1, x2, y2 = box
    cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
    cv2.putText(frame, text, (x1, max(15, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='videos/porch.webm', help='video file, or 0 for the webcam')
    parser.add_argument('--loop', action='store_true', help='replay the file when it ends')
    parser.add_argument('--linger', type=float, default=90, help='seconds near the package that count as lingering')
    parser.add_argument('--door', help='house entrance area as x1,y1,x2,y2 (pixels)')
    parser.add_argument('--backend', default=os.getenv('DEMAFUR_URL', 'http://127.0.0.1:8000'), help='DemaFur backend URL')
    parser.add_argument('--delivery', default=f'edge-{uuid.uuid4().hex[:8]}', help='delivery ID for this run')
    parser.add_argument('--camera', default='front-door', help='camera ID')
    parser.add_argument('--port', type=int, default=8090, help='port for the live view')
    parser.add_argument('--record', help='also save the annotated video to this .mp4 file')
    parser.add_argument('--no-window', action='store_true', help='do not open the OpenCV window (live view and recording still work)')
    args = parser.parse_args()

    door = [int(v) for v in args.door.split(',')] if args.door else None
    camera = Source(args.source, loop=args.loop)
    detector = Detector()
    scene = Scene(linger_seconds=args.linger, door=door)
    secret = os.getenv('DEMAFUR_WEBHOOK_SECRET')
    porch = Porch()
    live = LiveStream(args.port)
    bridge = Bridge(args.backend, secret, args.delivery, args.camera,
                    on_deterrents=porch.trigger) if secret else None
    print(f'Delivery {args.delivery}: ' + (f'sending events to {args.backend}' if bridge
                                           else 'DEMAFUR_WEBHOOK_SECRET not set, events are only printed'))
    next_search, last_event = 0.0, ''
    recorder, written = None, 0
    t = 0.0

    lap = 0
    for frame, t in camera.frames():
        if camera.laps != lap:
            # The looping video restarted: close this delivery and treat the next lap as a new one.
            lap = camera.laps
            for event in scene.finish(t):
                print(json.dumps(event))
                if bridge:
                    bridge.send(event)
            scene = Scene(linger_seconds=args.linger, door=door)
            porch.reset()
            last_event = ''
            if bridge:
                bridge.delivery_id = f'{args.delivery}-{lap}'
                print(f'New lap: delivery {bridge.delivery_id}')
        things = detector.track(frame)
        events = []
        if scene.wants_package_search() and t >= next_search:
            events += scene.offer_package(detector.find_package(frame), frame, t)
            next_search = t + 1.0
        events += scene.update(things, frame, t)

        for event in events:
            print(json.dumps(event))
            if bridge:
                bridge.send(event)
            last_event = f"{event['t']:.1f}s  {event['kind'].replace('_', ' ').upper()}"

        # Draw: the door area, the package (green, red once removed), people (red if they touched it).
        if door:
            draw_box(frame, door, (200, 200, 200), 'door')
        if scene.package:
            removed = scene.package_state == 'removed'
            draw_box(frame, scene.package, RED if removed else COLOURS['package'],
                     'package REMOVED' if removed else 'package')
        for item in things:
            touched = item['label'] == 'person' and scene.people.get(item['id'], {}).get('touched')
            name = item['label'] + (f" #{item['id']}" if item['id'] else '')
            draw_box(frame, item['box'], RED if touched else COLOURS[item['label']], name)
        porch.draw(frame)
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 32), (0, 0, 0), -1)
        cv2.putText(frame, f'LIVE {t:5.1f}s   {last_event}', (10, 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        live.publish(frame)
        if args.record:
            if recorder is None:   # opened on the first frame, once the picture size is known
                height, width = frame.shape[:2]
                recorder = cv2.VideoWriter(args.record, cv2.VideoWriter_fourcc(*'mp4v'),
                                           camera.fps, (width, height))
            # Frames skipped while detection was busy are filled with this frame, so the
            # recording keeps real-time length instead of playing back too fast.
            while written <= t * camera.fps:
                recorder.write(frame)
                written += 1
        if not args.no_window:
            cv2.imshow('DemaFur edge', frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
    for event in scene.finish(t):
        print(json.dumps(event))
        if bridge:
            bridge.send(event)
    if bridge:
        bridge.close()
    if recorder is not None:
        recorder.release()
        print(f'Annotated video saved: {args.record}')
    if not args.no_window:
        cv2.destroyAllWindows()


if __name__ == '__main__':
    main()