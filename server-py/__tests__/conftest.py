import os
import tempfile
from typing import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def test_db_path() -> Generator[str, None, None]:
    """Create a temporary database file."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    os.unlink(path)
    for ext in ("-wal", "-shm"):
        p = path + ext
        if os.path.exists(p):
            os.unlink(p)


@pytest.fixture(scope="session")
def client(test_db_path: str) -> Generator[TestClient, None, None]:
    """Create a TestClient with test database and encryption key."""
    os.environ["AI_CHAT_ENCRYPTION_KEY"] = "4b41d0b24a2f922485f2f728f113b8b83e599755a98555bf28d90dff93352da5"
    os.environ["AI_CHAT_DB_PATH"] = test_db_path
    os.environ["PORT"] = "3099"

    # Reset the database singleton
    import database
    database._db = None

    from app import app
    with TestClient(app) as c:
        yield c
