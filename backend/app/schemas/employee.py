from datetime import date
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.core.enums import Role


class EmployeeCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    role: Role = Role.EMPLOYEE
    employee_code: Optional[str] = Field(default=None, max_length=32)
    department: Optional[str] = Field(default=None, max_length=100)
    designation: Optional[str] = Field(default=None, max_length=100)
    joining_date: date
    manager_id: Optional[int] = None
    phone: Optional[str] = Field(default=None, max_length=32)


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    role: Optional[Role] = None
    department: Optional[str] = Field(default=None, max_length=100)
    designation: Optional[str] = Field(default=None, max_length=100)
    joining_date: Optional[date] = None
    manager_id: Optional[int] = None
    clear_manager: bool = False
    phone: Optional[str] = Field(default=None, max_length=32)


class SelfUpdate(BaseModel):
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=500)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=150)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=32)
