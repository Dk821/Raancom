from dataclasses import dataclass, field
from math import asin, cos, radians, sin, sqrt
from typing import Sequence

from app.core.enums import GeofenceStatus
from app.models.company_setting import CompanySetting
from app.models.office import Office

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    dphi = p2 - p1
    dlmb = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))


@dataclass
class GeofenceResult:
    status: str
    office: Office | None = None
    distance_m: float | None = None
    radius_m: int | None = None
    flags: list[str] = field(default_factory=list)


def evaluate_office(
    offices: Sequence[Office],
    lat: float | None,
    lon: float | None,
    accuracy_m: float | None,
    settings: CompanySetting,
) -> GeofenceResult:
    """Server-side geofence decision for OFFICE mode. The nearest active office is used.
    Coordinates are evidence, not proof: accuracy is stored and poor accuracy is flagged."""
    if lat is None or lon is None:
        return GeofenceResult(GeofenceStatus.NO_LOCATION.value, flags=["NO_LOCATION"])
    best: tuple[float, Office] | None = None
    for o in offices:
        d = haversine_m(lat, lon, o.latitude, o.longitude)
        if best is None or d < best[0]:
            best = (d, o)
    if best is None:
        return GeofenceResult(GeofenceStatus.NO_LOCATION.value, flags=["NO_OFFICE"])
    dist, office = best
    res = GeofenceResult(GeofenceStatus.INSIDE.value, office, round(dist, 1), office.radius_m)
    if dist > office.radius_m:
        res.status = GeofenceStatus.OUTSIDE.value
        res.flags.append("OUTSIDE_RADIUS")
    elif accuracy_m is not None and accuracy_m > settings.max_gps_accuracy_m:
        res.status = GeofenceStatus.LOW_ACCURACY.value
        res.flags.append("LOW_ACCURACY")
    if res.status == GeofenceStatus.OUTSIDE.value and accuracy_m is not None and accuracy_m > settings.max_gps_accuracy_m:
        res.flags.append("LOW_ACCURACY")
    return res
