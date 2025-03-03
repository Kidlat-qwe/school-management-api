// API Base URL
const API_BASE_URL = 'http://localhost:5174/api';

// Utility Functions
async function fetchAPI(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API request failed');
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        alert(error.message || 'An error occurred while processing your request');
        throw error;
    }
}

// Show/Hide Sections
function showSection(sectionId) {
    document.querySelectorAll('.card').forEach(card => {
        card.style.display = 'none';
    });
    document.getElementById(sectionId).style.display = 'block';
    loadSectionData(sectionId);
}

// Modal Functions
function showModal(modalId) {
    document.getElementById(`${modalId}Modal`).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Load Section Data
async function loadSectionData(section) {
    switch(section) {
        case 'classes':
            await loadClasses();
            break;
        case 'students':
            await loadStudents();
            break;
        case 'teachers':
            await loadTeachers();
            break;
        case 'subjects':
            await loadSubjects();
            break;
        case 'grades':
            await loadGrades();
            break;
    }
}

// Classes Functions
async function loadClasses() {
    try {
        const classes = await fetchAPI('/classes');
        const tableBody = document.getElementById('classesTableBody');
        tableBody.innerHTML = '';
        
        classes.forEach(cls => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cls.grade_level}</td>
                <td>${cls.section}</td>
                <td>${cls.school_year}</td>
                <td>
                    <button class="btn btn-primary" onclick="editClass(${cls.class_id})">Edit</button>
                    <button class="btn btn-primary" onclick="deleteClass(${cls.class_id})">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading classes:', error);
    }
}

async function editClass(classId) {
    try {
        const classData = await fetchAPI(`/classes/${classId}`);
        document.getElementById('editGradeLevel').value = classData.grade_level;
        document.getElementById('editSection').value = classData.section;
        document.getElementById('editSchoolYear').value = classData.school_year;
        document.getElementById('editClassDescription').value = classData.class_description || '';
        document.getElementById('editClassId').value = classId;
        showModal('editClass');
    } catch (error) {
        console.error('Error loading class data:', error);
    }
}

async function deleteClass(classId) {
    if (confirm('Are you sure you want to delete this class?')) {
        try {
            await fetchAPI(`/classes/${classId}`, { method: 'DELETE' });
            loadClasses();
        } catch (error) {
            console.error('Error deleting class:', error);
        }
    }
}

// Students Functions
async function loadStudents() {
    try {
        const students = await fetchAPI('/students');
        const tableBody = document.getElementById('studentsTableBody');
        tableBody.innerHTML = '';
        
        students.forEach(student => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${student.fname} ${student.mname ? student.mname + ' ' : ''}${student.lname}</td>
                <td>${student.gender}</td>
                <td>${student.age}</td>
                <td>
                    <button class="btn btn-primary" onclick="editStudent(${student.student_id})">Edit</button>
                    <button class="btn btn-primary" onclick="deleteStudent(${student.student_id})">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

async function editStudent(studentId) {
    try {
        const studentData = await fetchAPI(`/students/${studentId}`);
        document.getElementById('editStudentFname').value = studentData.fname;
        document.getElementById('editStudentMname').value = studentData.mname || '';
        document.getElementById('editStudentLname').value = studentData.lname;
        document.getElementById('editStudentGender').value = studentData.gender;
        document.getElementById('editStudentAge').value = studentData.age;
        document.getElementById('editStudentId').value = studentId;
        showModal('editStudent');
    } catch (error) {
        console.error('Error loading student data:', error);
    }
}

async function deleteStudent(studentId) {
    if (confirm('Are you sure you want to delete this student?')) {
        try {
            await fetchAPI(`/students/${studentId}`, { method: 'DELETE' });
            loadStudents();
        } catch (error) {
            console.error('Error deleting student:', error);
        }
    }
}

// Teachers Functions
async function loadTeachers() {
    try {
        const teachers = await fetchAPI('/teachers');
        const tableBody = document.getElementById('teachersTableBody');
        tableBody.innerHTML = '';
        
        teachers.forEach(teacher => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${teacher.fname} ${teacher.mname ? teacher.mname + ' ' : ''}${teacher.lname}</td>
                <td>${teacher.gender}</td>
                <td>${teacher.status || 'Active'}</td>
                <td>
                    <button class="btn btn-primary" onclick="editTeacher(${teacher.teacher_id})">Edit</button>
                    <button class="btn btn-primary" onclick="deleteTeacher(${teacher.teacher_id})">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading teachers:', error);
    }
}

async function editTeacher(teacherId) {
    try {
        const teacherData = await fetchAPI(`/teachers/${teacherId}`);
        document.getElementById('editTeacherFname').value = teacherData.fname;
        document.getElementById('editTeacherMname').value = teacherData.mname || '';
        document.getElementById('editTeacherLname').value = teacherData.lname;
        document.getElementById('editTeacherGender').value = teacherData.gender;
        document.getElementById('editTeacherId').value = teacherId;
        showModal('editTeacher');
    } catch (error) {
        console.error('Error loading teacher data:', error);
    }
}

async function deleteTeacher(teacherId) {
    if (confirm('Are you sure you want to delete this teacher?')) {
        try {
            await fetchAPI(`/teachers/${teacherId}`, { method: 'DELETE' });
            loadTeachers();
        } catch (error) {
            console.error('Error deleting teacher:', error);
        }
    }
}

// Subjects Functions
async function loadSubjects() {
    try {
        const subjects = await fetchAPI('/subjects');
        const tableBody = document.getElementById('subjectsTableBody');
        tableBody.innerHTML = '';
        
        subjects.forEach(subject => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${subject.subject_name}</td>
                <td>
                    <button class="btn btn-primary" onclick="editSubject(${subject.subject_id})">Edit</button>
                    <button class="btn btn-primary" onclick="deleteSubject(${subject.subject_id})">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

async function editSubject(subjectId) {
    try {
        const subjectData = await fetchAPI(`/subjects/${subjectId}`);
        document.getElementById('editSubjectName').value = subjectData.subject_name;
        document.getElementById('editSubjectId').value = subjectId;
        showModal('editSubject');
    } catch (error) {
        console.error('Error loading subject data:', error);
    }
}

async function deleteSubject(subjectId) {
    if (confirm('Are you sure you want to delete this subject?')) {
        try {
            await fetchAPI(`/subjects/${subjectId}`, { method: 'DELETE' });
            loadSubjects();
        } catch (error) {
            console.error('Error deleting subject:', error);
        }
    }
}

// Form Submissions
document.getElementById('addClassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = {
            grade_level: document.getElementById('gradeLevel').value,
            section: document.getElementById('section').value,
            school_year: document.getElementById('schoolYear').value,
            class_description: document.getElementById('classDescription').value
        };
        
        await fetchAPI('/classes', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        closeModal('addClassModal');
        loadClasses();
        e.target.reset();
    } catch (error) {
        console.error('Error adding class:', error);
    }
});

document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = {
            fname: document.getElementById('studentFname').value,
            mname: document.getElementById('studentMname').value,
            lname: document.getElementById('studentLname').value,
            gender: document.getElementById('studentGender').value,
            age: parseInt(document.getElementById('studentAge').value)
        };
        
        await fetchAPI('/students', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        closeModal('addStudentModal');
        loadStudents();
        e.target.reset();
    } catch (error) {
        console.error('Error adding student:', error);
    }
});

document.getElementById('editClassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const classId = document.getElementById('editClassId').value;
        const data = {
            grade_level: document.getElementById('editGradeLevel').value,
            section: document.getElementById('editSection').value,
            school_year: document.getElementById('editSchoolYear').value,
            class_description: document.getElementById('editClassDescription').value
        };
        
        await fetchAPI(`/classes/${classId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
        
        closeModal('editClassModal');
        loadClasses();
    } catch (error) {
        console.error('Error updating class:', error);
    }
});

document.getElementById('editStudentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const studentId = document.getElementById('editStudentId').value;
        const data = {
            fname: document.getElementById('editStudentFname').value,
            mname: document.getElementById('editStudentMname').value,
            lname: document.getElementById('editStudentLname').value,
            gender: document.getElementById('editStudentGender').value,
            age: parseInt(document.getElementById('editStudentAge').value)
        };
        
        await fetchAPI(`/students/${studentId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
        
        closeModal('editStudentModal');
        loadStudents();
    } catch (error) {
        console.error('Error updating student:', error);
    }
});

document.getElementById('editTeacherForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const teacherId = document.getElementById('editTeacherId').value;
        const data = {
            fname: document.getElementById('editTeacherFname').value,
            mname: document.getElementById('editTeacherMname').value,
            lname: document.getElementById('editTeacherLname').value,
            gender: document.getElementById('editTeacherGender').value
        };
        
        await fetchAPI(`/teachers/${teacherId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
        
        closeModal('editTeacherModal');
        loadTeachers();
    } catch (error) {
        console.error('Error updating teacher:', error);
    }
});

document.getElementById('addTeacherForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = {
            fname: document.getElementById('teacherFname').value,
            mname: document.getElementById('teacherMname').value,
            lname: document.getElementById('teacherLname').value,
            gender: document.getElementById('teacherGender').value
        };
        
        await fetchAPI('/teachers', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        closeModal('addTeacherModal');
        loadTeachers();
        e.target.reset();
    } catch (error) {
        console.error('Error adding teacher:', error);
    }
});

document.getElementById('addSubjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const data = {
            subject_name: document.getElementById('subjectName').value
        };
        
        await fetchAPI('/subjects', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        closeModal('addSubjectModal');
        loadSubjects();
        e.target.reset();
    } catch (error) {
        console.error('Error adding subject:', error);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showSection('classes');
}); 