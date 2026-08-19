from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

OUT = r'D:\project\procet_web\output\pdf\themis_database_erd_full.pdf'
FONT = r'C:\Windows\Fonts\arial.ttf'
FONT_BOLD = r'C:\Windows\Fonts\arialbd.ttf'
pdfmetrics.registerFont(TTFont('Arial', FONT))
pdfmetrics.registerFont(TTFont('Arial-Bold', FONT_BOLD))

NAVY = HexColor('#10233f')
BLUE = HexColor('#1769aa')
SKY = HexColor('#e8f3ff')
LINE = HexColor('#a9bdd1')
MUTED = HexColor('#58677a')
LIGHT = HexColor('#f6f9fc')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('TitleA', parent=styles['Title'], fontName='Arial-Bold', fontSize=22, leading=27, textColor=NAVY, spaceAfter=5))
styles.add(ParagraphStyle('SubA', parent=styles['Normal'], fontName='Arial', fontSize=9, leading=13, textColor=MUTED))
styles.add(ParagraphStyle('HeadA', parent=styles['Heading2'], fontName='Arial-Bold', fontSize=13, leading=17, textColor=NAVY, spaceBefore=4, spaceAfter=6))
styles.add(ParagraphStyle('CellA', parent=styles['Normal'], fontName='Arial', fontSize=7.2, leading=9, textColor=NAVY))
styles.add(ParagraphStyle('CellSmall', parent=styles['Normal'], fontName='Arial', fontSize=6.6, leading=8, textColor=NAVY))

tables = {
    'clients': ['id PK', 'name', 'name_vn NULL', 'name_kana NULL', 'client_type', 'email NULL', 'phone NULL', 'language NULL', 'address NULL', 'nationality NULL', 'notes NULL', 'created_at', 'updated_at', 'deleted_at NULL'],
    'case_files': ['id PK', 'title', 'case_type NULL', 'client_id FK', 'department_id FK NULL', 'assigned_employee_id FK NULL', 'status', 'created_at', 'updated_at', 'deleted_at NULL'],
    'case_documents': ['id PK', 'case_file_id FK', 'category', 'title', 'file_url NULL', 'version', 'status', 'created_by_employee_id FK NULL', 'created_by_ai_name NULL', 'confirmed_by_employee_id FK NULL', 'confirmed_at NULL', 'note NULL', 'created_at', 'updated_at'],
    'case_precedents': ['id PK', 'case_file_id FK', 'title', 'citation NULL', 'summary NULL', 'relevance NULL', 'source_url NULL', 'created_by_employee_id FK NULL', 'created_by_ai_name NULL', 'created_at', 'updated_at'],
    'case_meeting_logs': ['id PK', 'case_file_id FK', 'meeting_date', 'attendees NULL', 'content', 'next_action NULL', 'status', 'created_by_employee_id FK NULL', 'created_by_ai_name NULL', 'confirmed_by_employee_id FK NULL', 'confirmed_at NULL', 'created_at', 'updated_at'],
    'offices': ['id PK', 'office_code UNIQUE', 'name', 'address NULL', 'room_image NULL', 'status', 'created_at', 'updated_at'],
    'departments': ['id PK', 'office_id FK', 'department_code', 'name', 'status', 'created_at', 'updated_at', 'UNIQUE(office_id, department_code)'],
    'employees': ['id PK', 'employee_code UNIQUE', 'full_name', 'full_name_kana NULL', 'gender NULL', 'nationality_code NULL', 'date_of_birth NULL', 'hire_date', 'termination_date NULL', 'office_id FK', 'department_id FK NULL', 'position_title NULL', 'employment_type', 'work_email UNIQUE NULL', 'phone NULL', 'avatar_path NULL', 'status', 'created_at', 'updated_at', 'deleted_at NULL'],
    'users': ['id PK', 'employee_id FK NULL UNIQUE', 'name', 'email UNIQUE', 'email_verified_at NULL', 'password', 'remember_token NULL', 'login_id UNIQUE NULL', 'role', 'is_active', 'must_change_password', 'last_login_at NULL', 'created_at', 'updated_at'],
    'attendances': ['id PK', 'employee_id FK NULL', 'employee_name', 'work_date', 'clock_in', 'break_start NULL', 'break_end NULL', 'outside_destination NULL', 'outside_start NULL', 'outside_expected_end NULL', 'outside_end NULL', 'clock_out NULL', 'status', 'created_at', 'updated_at'],
    'work_sessions': ['id PK', 'attendance_id FK', 'task_description', 'started_at', 'expected_end_at', 'ended_at NULL', 'status', 'created_at', 'updated_at'],
    'employee_tasks': ['id PK', 'employee_id FK', 'work_session_id FK NULL UNIQUE', 'assigned_by FK NULL', 'title', 'description NULL', 'duration_minutes', 'status', 'due_at NULL', 'accepted_at NULL', 'completed_at NULL', 'created_at', 'updated_at'],
    'security_audit_logs': ['id PK', 'event', 'outcome', 'user_id FK NULL', 'employee_id FK NULL', 'identifier_hash NULL', 'ip_address NULL', 'request_method NULL', 'request_path NULL', 'user_agent NULL', 'metadata NULL JSON', 'created_at'],
    'matters': ['id PK', 'client_id FK NULL', 'title', 'status', 'category NULL', 'assigned_to NULL', 'created_at', 'updated_at'],
    'tasks': ['id PK', 'matter_id FK NULL', 'title', 'horizon ENUM(short, mid, long)', 'due_date NULL', 'status', 'source ENUM(ai_generated, manual)', 'assigned_to NULL', 'created_at', 'updated_at'],
    'personas': ['id PK', 'name UNIQUE', 'display_name', 'skills JSON', 'active', 'created_at', 'updated_at'],
    'secretary_logs': ['id PK', 'skill_name NULL', 'trigger_type', 'input NULL JSON', 'output NULL JSON', 'status', 'created_at', 'updated_at'],
    'skill_proposals': ['id PK', 'skill_name', 'current_content NULL', 'proposed_content', 'reason NULL', 'proposed_by NULL', 'status', 'decided_by NULL', 'decided_at NULL', 'implemented_by NULL', 'implemented_at NULL', 'created_at', 'updated_at'],
    'approval_requests': ['id PK', 'action_type', 'tool_name NULL', 'payload NULL JSON', 'requested_by FK NULL', 'status', 'approved_by FK NULL', 'approved_at NULL', 'rejected_by FK NULL', 'rejected_at NULL', 'created_at', 'updated_at'],
    'password_reset_tokens': ['email PK', 'token', 'created_at NULL'],
    'sessions': ['id PK', 'user_id INDEX NULL', 'ip_address NULL', 'user_agent NULL', 'payload', 'last_activity'],
    'personal_access_tokens': ['id PK', 'tokenable_type', 'tokenable_id', 'name', 'token UNIQUE', 'abilities NULL', 'last_used_at NULL', 'expires_at NULL', 'created_at', 'updated_at'],
    'cache': ['key PK', 'value', 'expiration'],
    'cache_locks': ['key PK', 'owner', 'expiration'],
    'jobs': ['id PK', 'queue', 'payload', 'attempts', 'reserved_at NULL', 'available_at', 'created_at'],
    'job_batches': ['id PK', 'name', 'total_jobs', 'pending_jobs', 'failed_jobs', 'failed_job_ids', 'options NULL', 'cancelled_at NULL', 'created_at', 'finished_at NULL'],
    'failed_jobs': ['id PK', 'uuid UNIQUE', 'connection', 'queue', 'payload', 'exception', 'failed_at'],
}

groups = [
    ('1. Quản lý hồ sơ', ['clients', 'case_files', 'case_documents', 'case_precedents', 'case_meeting_logs']),
    ('2. Tổ chức và nhân sự', ['offices', 'departments', 'employees', 'users', 'attendances', 'work_sessions', 'employee_tasks', 'security_audit_logs']),
    ('3. Công việc và AI', ['matters', 'tasks', 'personas', 'secretary_logs', 'skill_proposals', 'approval_requests']),
    ('4. Bảng hạ tầng Laravel', ['password_reset_tokens', 'sessions', 'personal_access_tokens', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs']),
]

relations = [
    ('offices', 'departments', 'offices.id -> departments.office_id'),
    ('offices', 'employees', 'offices.id -> employees.office_id'),
    ('departments', 'employees', 'departments.id -> employees.department_id'),
    ('employees', 'users', 'employees.id -> users.employee_id'),
    ('employees', 'attendances', 'employees.id -> attendances.employee_id'),
    ('attendances', 'work_sessions', 'attendances.id -> work_sessions.attendance_id'),
    ('employees', 'employee_tasks', 'employees.id -> employee_tasks.employee_id'),
    ('work_sessions', 'employee_tasks', 'work_sessions.id -> employee_tasks.work_session_id'),
    ('users', 'employee_tasks', 'users.id -> employee_tasks.assigned_by'),
    ('users', 'approval_requests', 'users.id -> requested_by / approved_by / rejected_by'),
    ('users', 'security_audit_logs', 'users.id -> security_audit_logs.user_id'),
    ('employees', 'security_audit_logs', 'employees.id -> security_audit_logs.employee_id'),
    ('clients', 'matters', 'clients.id -> matters.client_id'),
    ('matters', 'tasks', 'matters.id -> tasks.matter_id'),
    ('clients', 'case_files', 'clients.id -> case_files.client_id'),
    ('departments', 'case_files', 'departments.id -> case_files.department_id'),
    ('employees', 'case_files', 'employees.id -> case_files.assigned_employee_id'),
    ('case_files', 'case_documents', 'case_files.id -> case_documents.case_file_id'),
    ('case_files', 'case_precedents', 'case_files.id -> case_precedents.case_file_id'),
    ('case_files', 'case_meeting_logs', 'case_files.id -> case_meeting_logs.case_file_id'),
    ('employees', 'case_documents', 'employees.id -> created_by / confirmed_by'),
    ('employees', 'case_precedents', 'employees.id -> created_by'),
    ('employees', 'case_meeting_logs', 'employees.id -> created_by / confirmed_by'),
]

def footer(c, doc):
    c.saveState()
    c.setStrokeColor(LINE); c.line(15*mm, 12*mm, 282*mm, 12*mm)
    c.setFont('Arial', 7); c.setFillColor(MUTED)
    c.drawString(15*mm, 7*mm, 'THEMIS HQ AI Employee Platform - Database ERD')
    c.drawRightString(282*mm, 7*mm, f'Trang {doc.page}')
    c.restoreState()

def schema_table(name, fields):
    data = [[Paragraph('<b>Cột</b>', styles['CellA']), Paragraph('<b>Ghi chú</b>', styles['CellA'])]]
    for field in fields:
        note = 'Khóa chính' if ' PK' in field else ('Khóa ngoại' if ' FK' in field else ('Có thể rỗng' if ' NULL' in field else ''))
        data.append([Paragraph(field, styles['CellSmall']), Paragraph(note, styles['CellSmall'])])
    t = Table(data, colWidths=[63*mm, 30*mm], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SKY), ('TEXTCOLOR', (0,0), (-1,0), NAVY),
        ('GRID', (0,0), (-1,-1), .25, LINE), ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 4), ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('BACKGROUND', (0,1), (-1,-1), colors.white),
    ]))
    return KeepTogether([Paragraph(name, styles['HeadA']), t, Spacer(1, 4*mm)])

def draw_box(c, x, y, title, fields):
    h = 23 + len(fields) * 9
    c.setFillColor(colors.white); c.setStrokeColor(BLUE); c.roundRect(x, y-h, 128, h, 4, fill=1, stroke=1)
    c.setFillColor(NAVY); c.roundRect(x, y-19, 128, 19, 4, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont('Arial-Bold', 8); c.drawString(x+6, y-13, title)
    c.setFillColor(NAVY); c.setFont('Arial', 6.8)
    for i, field in enumerate(fields): c.drawString(x+6, y-30-i*9, field)
    return y-h

def relationship_page(c, doc):
    c.saveState(); c.setFont('Arial-Bold', 21); c.setFillColor(NAVY); c.drawString(15*mm, 190*mm, 'Sơ đồ liên kết dữ liệu')
    c.setFont('Arial', 9); c.setFillColor(MUTED); c.drawString(15*mm, 184*mm, 'Mũi tên biểu diễn khóa ngoại: bảng con -> bảng cha. Các cột FK chi tiết nằm ở những trang sau.')
    x1, x2, x3, x4 = 15*mm, 85*mm, 155*mm, 225*mm
    boxes = [
        (x1, 170*mm, 'OFFICES', ['id PK', 'office_code', 'name']),
        (x2, 170*mm, 'DEPARTMENTS', ['id PK', 'office_id FK', 'department_code']),
        (x3, 170*mm, 'EMPLOYEES', ['id PK', 'office_id FK', 'department_id FK']),
        (x4, 170*mm, 'USERS', ['id PK', 'employee_id FK', 'role']),
        (x1, 120*mm, 'CLIENTS', ['id PK', 'name', 'client_type']),
        (x2, 120*mm, 'CASE_FILES', ['id PK', 'client_id FK', 'department_id FK', 'assigned_employee_id FK']),
        (x3, 120*mm, 'CASE_DOCUMENTS', ['id PK', 'case_file_id FK', 'created_by_employee_id FK']),
        (x4, 120*mm, 'CASE_MEETING_LOGS', ['id PK', 'case_file_id FK', 'created_by_employee_id FK']),
        (x1, 66*mm, 'MATTERS', ['id PK', 'client_id FK', 'title']),
        (x2, 66*mm, 'TASKS', ['id PK', 'matter_id FK', 'status']),
        (x3, 66*mm, 'CASE_PRECEDENTS', ['id PK', 'case_file_id FK', 'created_by_employee_id FK']),
        (x4, 66*mm, 'APPROVAL_REQUESTS', ['id PK', 'requested_by FK', 'approved_by FK', 'rejected_by FK']),
    ]
    for x, y, title, fields in boxes: draw_box(c, x, y, title, fields)
    c.setStrokeColor(BLUE); c.setLineWidth(.9); c.setFillColor(BLUE)
    for a,b in [((x1+128,161*mm),(x2,161*mm)), ((x2+128,161*mm),(x3,161*mm)), ((x3+128,161*mm),(x4,161*mm)), ((x1+64,112*mm),(x2+64,112*mm)), ((x2+128,112*mm),(x3,112*mm)), ((x2+64,112*mm),(x4+64,112*mm)), ((x1+64,58*mm),(x2+64,58*mm)), ((x2+64,104*mm),(x3+64,66*mm)), ((x4+64,161*mm),(x4+64,105*mm))]:
        c.line(a[0],a[1],b[0],b[1])
    footer(c, doc); c.restoreState()

def make_pdf():
    doc = SimpleDocTemplate(OUT, pagesize=landscape(A4), rightMargin=15*mm, leftMargin=15*mm, topMargin=14*mm, bottomMargin=18*mm)
    # Page one is reserved for the relationship map painted by relationship_page.
    # The tiny spacer makes ReportLab create this first page before the page break.
    story = [Spacer(1, 1), PageBreak()]
    for index, (group_title, names) in enumerate(groups):
        story.append(Paragraph(group_title, styles['TitleA']))
        story.append(Paragraph('Cấu trúc đầy đủ các cột. Trường timestamp được hiển thị theo schema đã migrate.', styles['SubA']))
        story.append(Spacer(1, 3*mm))
        for name in names:
            story.append(schema_table(name, tables[name]))
        if index < len(groups)-1: story.append(PageBreak())
    doc.build(story, onFirstPage=relationship_page, onLaterPages=footer)

if __name__ == '__main__': make_pdf()
