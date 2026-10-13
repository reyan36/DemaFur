"""DemaFur edge detector. Step 1: show the simulated live camera."""
import argparse

import cv2

from source import Source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='videos/porch.webm', help='video file, or 0 for the webcam')
    parser.add_argument('--loop', action='store_true', help='replay the file when it ends')
    args = parser.parse_args()

    camera = Source(args.source, loop=args.loop)
    for frame, t in camera.frames():
        cv2.putText(frame, f'LIVE  {t:5.1f}s', (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.imshow('DemaFur edge', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()