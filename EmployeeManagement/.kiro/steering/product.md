---
title: EmployeeManagement Product Overview
description: Product requirements and business context for the THEMIS HQ Employee Management System
inclusion: auto
---

# EmployeeManagement Product Overview

## Purpose

EmployeeManagement is a comprehensive employee attendance and work session tracking system designed for **THEMIS HQ (合同AI事務所)** - a multi-office organization in Japan. The system enables employees to clock in/out, manage their work status throughout the day, track individual tasks, and generate detailed attendance reports.

The primary goal is to provide a modern, user-friendly interface for daily attendance management while maintaining detailed records for payroll, productivity analysis, and compliance purposes.

## Core Business Requirements

### Attendance System

The attendance system is the heart of the application, tracking employee work patterns with precision:

**Daily Attendance Flow:**
1. **Clock In** - Employee starts their workday, creating an attendance record
2. **Status Management** - Throughout the day, employees update their status:
   - **Working** - Active at their desk
   - **Break** - Taking lunch or rest break (with start/end times)
   - **Outside** - Out of office for business (with destination and expected return time)
   - **Offline** - Workday completed (clock out)
3. **Clock Out** - Employee ends their workday

**Key Features:**
- Real-time status visualization on an office map
- Automatic calculation of work hours (excluding break periods)
- Outside work tracking with reminder notifications (30min, 10min before expected return)
- Legacy attendance claiming for records created before employee accounts existed
- Personal attendance report export to Excel

### Work Session Tracking

Beyond basic attendance, the system tracks individual tasks and projects:

**Work Session Concept:**
- Each task has a description, start time, expected completion time, and actual completion time
- When starting a new task, the previous active task is automatically completed
- Tasks are linked to the attendance record of that day
- Work sessions enable productivity tracking and time management analysis

**Use Cases:**
- Project time tracking
- Task completion metrics
- Workload distribution analysis
- Billing/invoicing support for client work

### Office Management

The system supports multiple offices/branches:

**Current Offices:**
- **THEMIS HQ** - Main office (大阪府松原市北新町2-5-13)
- **CHUKA LAW Office** - Law office branch (大阪府松原市天美東1-80-22)

**Office Features:**
- Visual office room representation with employee avatars
- Office-specific employee lists
- Per-office attendance dashboards
- Room images and location information

### Excel Export System

A unique feature that synchronizes attendance data to professionally formatted Excel files:

**Master Attendance Sheet:**
- Real-time updates for every attendance change
- Beautifully designed dashboard with metrics
- Separate sheets for attendance records and work sessions
- Auto-calculated work hours and summary statistics
- Color-coded status indicators

**Personal Reports:**
- Downloadable individual attendance history
- Professional report format suitable for HR/payroll
- Includes both attendance and work session details
- Marked as confidential

### Future Planned Modules

The following features are planned but not yet implemented:

**1. Organization Design (組織設計)**
- Organizational chart visualization
- Department and team management
- Position/role hierarchy
- Reporting structure management

**2. Business Quest (業務クエスト)**
- Project and task management system
- Quest/mission-based work assignment
- Team collaboration features
- Progress tracking and milestones

**3. Manual Workshop (マニュアル工房)**
- Company wiki and knowledge base
- Standard operating procedures (SOPs)
- Training materials
- Documentation versioning

**4. AI Employees (AI社員)**
- AI assistant integration
- Automated task suggestions
- Intelligent scheduling
- Chatbot support

**5. Approval Room (承認室)**
- Leave request approval workflow
- Expense approval
- Document approval pipeline
- Multi-level approval chains
- Notification system for approvers

## Target Users

### Primary Users: Employees
**Persona: Regular Office Worker**
- **Needs**: Simple, quick attendance tracking without complexity
- **Daily Tasks**: Clock in/out, update work status, register tasks
- **Technical Level**: Basic - should work without training
- **Language**: Japanese (UI fully localized)
- **Devices**: Desktop at office, mobile for remote check-ins

**Behaviors:**
- Logs in once per day
- Updates status 3-5 times during workday
- Registers 2-4 work sessions per day
- Downloads personal attendance report monthly

### Secondary Users: Managers
**Persona: Team Lead / Department Manager**
- **Needs**: Visibility into team attendance and productivity
- **Responsibilities**: Monitor team status, approve corrections, review reports
- **Technical Level**: Intermediate
- **Future Features**: Approval workflows, team reports, analytics

### Tertiary Users: HR / Administrators
**Persona: HR Staff / System Administrator**
- **Needs**: Full system access, employee management, report generation
- **Responsibilities**: User account management, attendance corrections, compliance reporting
- **Technical Level**: Advanced
- **Future Features**: Admin panel, bulk operations, audit logs access

## User Experience Principles

**Simplicity First:**
- One-click attendance actions
- Minimal form fields
- Clear visual feedback
- Japanese language throughout

**Real-time Updates:**
- Instant status changes reflected on office map
- Live employee list updates
- Toast notifications for all actions

**Mobile-Responsive:**
- Functional on smartphones for remote workers
- Touch-friendly controls
- Slide-out navigation drawer

**Beautiful Design:**
- Modern gradient aesthetics
- Smooth animations
- Professional appearance suitable for business environment
- Dark/light theme support

## Business Rules

**Attendance Rules:**
1. An employee can only have one active attendance record per day
2. Clock out is final - no further status changes allowed after offline
3. Break periods are optional but recorded if used
4. Outside work requires destination and expected return time
5. Work sessions must be linked to an active attendance record

**Work Session Rules:**
1. Only one work session can be active at a time per employee
2. Starting a new session automatically completes the previous one
3. Expected end time can span midnight (next day)
4. Completed sessions cannot be edited (historical record)

**Security & Access:**
1. Employees can only view/modify their own attendance
2. Authentication required for all operations (except login)
3. Security audit log for all sensitive actions
4. Token-based authentication with configurable expiration

**Data Integrity:**
1. All timestamps stored in Asia/Tokyo timezone
2. Attendance records are permanent (soft delete for employees)
3. Excel synchronization is non-blocking (failures logged but not breaking)
4. Legacy attendance records can be claimed by matching employee name

## Success Metrics

**User Adoption:**
- Daily active users > 90% of employee base
- Average time to clock in/out < 10 seconds
- Mobile usage > 30% of total sessions

**System Performance:**
- API response time < 500ms for 95% of requests
- Excel generation < 3 seconds for personal reports
- Zero data loss incidents
- 99.5% uptime during business hours

**User Satisfaction:**
- Task completion rate > 95%
- Support tickets < 2 per week
- Positive feedback on UI/UX
- Feature adoption rate for work sessions > 60%

## Integration Points

**Current:**
- None (standalone system)

**Planned:**
- Email server for notifications
- Payroll system data export
- Calendar integration (Google Calendar, Outlook)
- Single Sign-On (SSO) with company directory
- Mobile push notification service

## Compliance & Regulatory

**Labor Law Compliance:**
- Accurate time tracking for work hours
- Break period recording
- Overtime calculation support (future)
- Historical record preservation

**Data Protection:**
- Personal information minimization
- Secure authentication
- Audit logging for compliance
- Data export capability for employee requests

**Document Retention:**
- Attendance records retained indefinitely
- Audit logs retained for minimum 1 year
- Excel exports available for archival purposes
