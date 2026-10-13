"""Object detection and tracking for the edge detector (YOLOE, open vocabulary)."""
from pathlib import Path

import torch
from ultralytics import YOLOE

MODEL = 'yoloe-11s-seg.pt'
TRACKED = ['person', 'car']     # moving things: each gets an ID that follows it between frames
PACKAGE = ['cardboard box']     # found separately: it never moves on its own and is often covered
MIN_CONF = {'person': 0.3, 'car': 0.4, 'cardboard box': 0.1}
TRACKER = str(Path(__file__).with_name('tracker.yaml'))


def _load(labels):
    model = YOLOE(MODEL)
    model.set_classes(labels, model.get_text_pe(labels))
    return model


class Detector:
    def __init__(self):
        # Two copies of the model: one keeps tracking state, one just looks for the package.
        self.tracker = _load(TRACKED)
        self.finder = _load(PACKAGE)
        self.device = 'mps' if torch.backends.mps.is_available() else 'cpu'

    def track(self, frame):
        """People and cars in this frame, each with a stable ID while it stays in view."""
        result = self.tracker.track(frame, persist=True, conf=0.05, tracker=TRACKER,
                                    device=self.device, verbose=False)[0]
        boxes = result.boxes
        ids = boxes.id.int().tolist() if boxes.id is not None else [None] * len(boxes)
        found = []
        for cls, conf, box, track_id in zip(boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist(), ids):
            label = TRACKED[int(cls)]
            # Keep confident detections, and weak ones the tracker is already following
            # (a person crouching over a parcel briefly looks less like a person).
            if conf >= MIN_CONF[label] or track_id is not None:
                found.append({'label': label, 'id': track_id, 'conf': round(conf, 2),
                              'box': [int(v) for v in box]})
        return found

    def find_package(self, frame):
        """The most likely package box in this frame, or None."""
        result = self.finder.predict(frame, conf=MIN_CONF['cardboard box'], device=self.device, verbose=False)[0]
        if not len(result.boxes):
            return None
        best = int(result.boxes.conf.argmax())
        return {'label': 'package', 'conf': round(float(result.boxes.conf[best]), 2),
                'box': [int(v) for v in result.boxes.xyxy[best].tolist()]}