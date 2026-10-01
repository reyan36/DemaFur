"""Firebase Firestore requires no schema migrations."""
import os

def migrate(url=None):
    print('Firebase Firestore is schemaless; no migrations needed.')

if __name__ == '__main__':
    migrate()
