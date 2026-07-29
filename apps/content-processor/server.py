"""Polaris content processor migration entrypoint.

The production transport and processing implementation are introduced by
Ticket 42. Keeping this entrypoint side-effect free lets the workspace own the
deployment shape before behavior is migrated.
"""


def create_application() -> None:
    """Return the content processor application once its transport is migrated."""
    return None
