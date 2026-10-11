"""Atomically save private run JSON. Only the Codex host calls Gmail."""
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".checkpoint-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["read", "write", "commit"])
    parser.add_argument("path")
    parser.add_argument("--destination")
    parser.add_argument("--section", choices=["all", "meta", "records"], default="all")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()
    if args.action == "write":
        write(args.path, json.load(sys.stdin))
        print(json.dumps({"saved": True}))
    elif args.action == "commit":
        if not args.destination:
            parser.error("commit requires --destination")
        source = Path(args.path)
        destination = Path(args.destination)
        if source.parent.resolve() != destination.parent.resolve():
            parser.error("commit must stay in the same private directory")
        json.loads(source.read_text(encoding="utf-8"))
        os.chmod(source, 0o600)
        with source.open("rb") as stream:
            os.fsync(stream.fileno())
        os.replace(source, destination)
        print(json.dumps({"saved": True}))
    else:
        path = Path(args.path)
        value = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        if value is not None and args.section == "meta":
            value = {k: v for k, v in value.items() if k != "records"}
        elif value is not None and args.section == "records":
            ids = value.get("order", [])[args.offset:args.offset + args.limit]
            value = {mid: value["records"][mid] for mid in ids}
        print(json.dumps(value, ensure_ascii=False))


if __name__ == "__main__":
    main()
