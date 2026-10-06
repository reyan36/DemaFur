"""In-memory stand-in for the Firestore client, for local runs and tests.

Enable with DEMAFUR_LOCAL_DB=memory. Data lives only while the server runs and is
never sent anywhere, so local experiments cannot touch the team's real Firestore.
It supports only the small part of the Firestore API that db.py uses.
"""
import copy
import threading
import uuid

# Operator string in a FieldFilter -> function(field_value, filter_value).
_OPS = {
    '==': lambda a, b: a == b,
    '!=': lambda a, b: a != b,
    '<': lambda a, b: a is not None and a < b,
    '<=': lambda a, b: a is not None and a <= b,
    '>': lambda a, b: a is not None and a > b,
    '>=': lambda a, b: a is not None and a >= b,
    'in': lambda a, b: a in b,
}


# Fake Firestore client. Stores {collection: {document_id: fields}} in memory.
class MemoryFirestore:
    def __init__(self):
        self.data = {}  # collection name -> {document id -> document fields}
        self.lock = threading.RLock()  # serialize access across FastAPI worker threads

    def collection(self, name):
        return CollectionRef(self, name)

    def batch(self):
        return Batch()


# Mirrors DocumentSnapshot: the result of reading one document.
class DocSnapshot:
    def __init__(self, reference, data):
        self.reference, self.id = reference, reference.id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return copy.deepcopy(self._data) if self._data is not None else None


# Mirrors DocumentReference: get, set, update or delete one document.
class DocRef:
    def __init__(self, store, collection, doc_id):
        self.store, self.collection, self.id = store, collection, doc_id

    def _docs(self):
        return self.store.data.setdefault(self.collection, {})

    def get(self):
        with self.store.lock:
            return DocSnapshot(self, copy.deepcopy(self._docs().get(self.id)))

    def set(self, data):
        with self.store.lock:
            self._docs()[self.id] = copy.deepcopy(data)

    def update(self, fields):
        with self.store.lock:
            if self.id not in self._docs():
                raise KeyError(f'No document to update: {self.collection}/{self.id}')
            self._docs()[self.id].update(copy.deepcopy(fields))

    def delete(self):
        with self.store.lock:
            self._docs().pop(self.id, None)


# Mirrors Query: immutable builder for where/order_by/limit, executed by stream().
class Query:
    def __init__(self, store, collection, filters=(), orders=(), max_items=None):
        self.store, self.collection = store, collection
        self.filters, self.orders, self.max_items = list(filters), list(orders), max_items

    def _copy(self, **changes):
        query = Query(self.store, self.collection, self.filters, self.orders, self.max_items)
        for key, value in changes.items():
            setattr(query, key, value)
        return query

    def where(self, filter):
        return self._copy(filters=self.filters + [filter])

    def order_by(self, field, direction='ASCENDING'):
        return self._copy(orders=self.orders + [(field, direction)])

    def limit(self, count):
        return self._copy(max_items=count)

    def stream(self):
        with self.store.lock:
            items = list(self.store.data.get(self.collection, {}).items())
        matches = [(doc_id, data) for doc_id, data in items
                   if all(_OPS[f.op_string](data.get(f.field_path), f.value) for f in self.filters)]
        # Apply sort keys from last to first so the first order_by wins (stable sort).
        for field, direction in reversed(self.orders):
            matches.sort(key=lambda item: (item[1].get(field) is None, item[1].get(field)),
                         reverse=direction == 'DESCENDING')
        if self.max_items is not None:
            matches = matches[:self.max_items]
        return [DocSnapshot(DocRef(self.store, self.collection, doc_id), copy.deepcopy(data))
                for doc_id, data in matches]


# Mirrors CollectionReference: a Query over the whole collection, plus document() and add().
class CollectionRef(Query):
    def __init__(self, store, name):
        super().__init__(store, name)

    def document(self, doc_id=None):
        return DocRef(self.store, self.collection, doc_id or uuid.uuid4().hex)

    def add(self, data):
        reference = self.document()
        reference.set(data)
        return None, reference


# Mirrors WriteBatch: queued writes applied on commit() (not atomic, unlike Firestore).
class Batch:
    def __init__(self):
        self.operations = []

    def set(self, reference, data):
        self.operations.append(lambda: reference.set(data))

    def update(self, reference, fields):
        self.operations.append(lambda: reference.update(fields))

    def delete(self, reference):
        self.operations.append(reference.delete)

    def commit(self):
        for operation in self.operations:
            operation()