"""Frame sources for the edge detector: a video file played like a live camera, or a webcam."""
import time

import cv2


class Source:
    """Opens a video file or a webcam and yields frames at the speed a live camera would."""

    def __init__(self, spec, loop=False):
        # A number (like "0") means a webcam index; anything else is a file path.
        self.live = spec.isdigit()
        self.cap = cv2.VideoCapture(int(spec) if self.live else spec)
        if not self.cap.isOpened():
            raise SystemExit(f'Cannot open video source: {spec}')
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 25
        self.loop = loop
        self.laps = 0               # how many times a looping file has restarted

    def frames(self):
        """Yield (frame, seconds since start).

        Files are paced to real time. If processing falls behind, late frames are
        dropped instead of slowing the video down, which is what a live feed does.
        """
        start = time.monotonic()
        index = 0
        while True:
            ok, frame = self.cap.read()
            if not ok:
                if self.loop and not self.live:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    self.laps += 1
                    continue
                return
            if self.live:
                yield frame, time.monotonic() - start
                continue
            t = index / self.fps
            index += 1
            lag = time.monotonic() - (start + t)
            if lag > 1 / self.fps:
                continue          # we're behind: drop this frame
            if lag < 0:
                time.sleep(-lag)  # we're early: wait until its real time
            yield frame, t