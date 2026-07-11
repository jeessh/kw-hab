from fastapi import APIRouter, Depends

from app.api.deps import get_current_host
from app.models.host import Host
from app.schemas.host import HostOut

router = APIRouter(prefix="/hosts", tags=["hosts"])


@router.get("/me", response_model=HostOut)
def get_me(host: Host = Depends(get_current_host)):
    return host
