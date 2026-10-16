"""Simulated porch hardware: a spoken warning and porch lights.

There is no real Ring speaker or floodlight here, so the warning is spoken through the
computer's speaker (macOS `say`) and the lights are drawn on the video. In a real install,
this is where a Ring Floodlight or Chime would be triggered.
"""
import shutil
import subprocess
import time

import cv2

WARNING = 'Attention. This entrance is being recorded.'
LIGHTS_SECONDS = 15


class Porch:
    def __init__(self):
        self.lights_until = 0.0
        self.warned_at = 0.0
        self.done = set()           # run each deterrent once per run

    def trigger(self, actions):
        """Called with the backend's auto_deterrents list."""
        for action in actions:
            if action in self.done:
                continue
            self.done.add(action)
            if action == 'turn_on_lights':
                self.lights_until = time.monotonic() + LIGHTS_SECONDS
                print('  !! porch lights ON')
            elif action == 'play_warning':
                self.warned_at = time.monotonic()
                print(f'  !! warning: "{WARNING}"')
                if shutil.which('say'):
                    subprocess.Popen(['say', WARNING])   # Popen: speak without pausing the video

    def draw(self, frame):
        now = time.monotonic()
        if now < self.lights_until:
            frame[:] = cv2.convertScaleAbs(frame, alpha=1.25, beta=45)   # brighten the whole picture
            self._badge(frame, 'PORCH LIGHTS ON', 0, (0, 220, 255))
        if now - self.warned_at < 6:
            self._badge(frame, 'WARNING PLAYING', 1, (60, 60, 255))

    @staticmethod
    def _badge(frame, text, row, colour):
        x, y = frame.shape[1] - 230, 45 + row * 34
        cv2.rectangle(frame, (x, y), (x + 220, y + 26), colour, -1)
        cv2.putText(frame, text, (x + 8, y + 19), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)