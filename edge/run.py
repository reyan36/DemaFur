"""DemaFur edge detector. Step 2: live boxes for people and the package."""
import argparse

import cv2

from detector import Detector
from source import Source

# OpenCV colours are BGR (blue, green, red).
COLOURS = {'person': (0, 200, 255), 'car': (255, 160, 0), 'package': (80, 220, 80)}


def draw(frame, item):
    x1, y1, x2, y2 = item['box']
    colour = COLOURS[item['label']]
    name = item['label'] + (f" #{item['id']}" if item.get('id') else '')
    cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
    cv2.putText(frame, f"{name} {item['conf']:.2f}", (x1, max(15, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='videos/porch.webm', help='video file, or 0 for the webcam')
    parser.add_argument('--loop', action='store_true', help='replay the file when it ends')
    args = parser.parse_args()

    camera = Source(args.source, loop=args.loop)
    detector = Detector()
    package, next_package_check = None, 0.0

    for frame, t in camera.frames():
        things = detector.track(frame)
        if t >= next_package_check:          # looking for the package once a second is enough
            package = detector.find_package(frame)
            next_package_check = t + 1.0

        for item in things + ([package] if package else []):
            draw(frame, item)
        cv2.putText(frame, f'LIVE  {t:5.1f}s', (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.imshow('DemaFur edge', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()