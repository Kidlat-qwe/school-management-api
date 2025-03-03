
document.addEventListener('DOMContentLoaded', function() {
  // Navigation
  const navLinks = document.querySelectorAll('.nav-link');
  const pages = document.querySelectorAll('[id$="-page"]');
  
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetPage = this.getAttribute('data-page');
      
      // Hide all pages
      pages.forEach(page => {
        page.style.display = 'none';
      });
      
      // Show target page
      document.getElementById(targetPage + '-page').style.display = 'block';
      
      // Load data for the page
      if (targetPage === 'dashboard') {
        loadDashboardData();
      } else if (targetPage === 'students') {
        loadStudents();
      } else if (targetPage === 'teachers') {
        loadTeachers();
      } else if (targetPage === 'classes') {
        loadClasses();
      } else if (targetPage === 'subjects') {
        loadSubjects();
      } else if (targetPage === 'grades') {
        loadGrades();
      }
    });
  });
  
  // Load dashboard data by default
  loadDashboardData();
  
  // Add student form submission
  const addStudentForm = document.getElementById('add-student-form');
  if (addStudentForm) {
    addStudentForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const formData = {
        fname: document.getElementById('fname').value,
        mname: document.getElementById('mname').value,
        lname: document.getElementById('lname').value,
        gender: document.getElementById('gender').value,
        age: parseInt(document.getElementById('age').value)
      };
      
      fetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
      .then(response => response.json())
      .then(data => {
        // Close modal and reload students
        const modal = bootstrap.Modal.getInstance(document.getElementById('addStudentModal'));
        modal.hide();
        loadStudents();
      })
      .catch(error => {
        console.error('Error adding student:', error);
        alert('Error adding student. Please try again.');
      });
    });
  }
  
  // Functions to load data
  function loadDashboardData() {
    // Load counts for dashboard
    fetch('/api/students')
      .then(response => response.json())
      .then(data => {
        document.getElementById('student-count').textContent = data.length;
      });
    
    fetch('/api/teachers')
      .then(response => response.json())
      .then(data => {
        document.getElementById('teacher-count').textContent = data.length;
      });
    
    fetch('/api/classes')
      .then(response => response.json())
      .then(data => {
        document.getElementById('class-count').textContent = data.length;
      });
    
    fetch('/api/subjects')
      .then(response => response.json())
      .then(data => {
        document.getElementById('subject-count').textContent = data.length;
      });
  }
  
  function loadStudents() {
    fetch('/api/students')
      .then(response => response.json())
      .then(data => {
        const tableBody = document.getElementById('students-table-body');
        tableBody.innerHTML = '';
        
        data.forEach(student => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${student.student_id}</td>
            <td>${student.fname}</td>
            <td>${student.mname || ''}</td>
            <td>${student.lname}</td>
            <td>${student.gender}</td>
            <td>${student.age}</td>
            <td>
              <button class="btn btn-sm btn-primary btn-action edit-student" data-id="${student.student_id}">Edit</button>
              <button class="btn btn-sm btn-danger btn-action delete-student" data-id="${student.student_id}">Delete</button>
            </td>
          `;
          tableBody.appendChild(row);
        });
        
        // Add event listeners for edit and delete buttons
        addStudentActionListeners();
      })
      .catch(error => {
        console.error('Error loading students:', error);
      });
  }
  
  function addStudentActionListeners() {
    // Edit student
    document.querySelectorAll('.edit-student').forEach(button => {
      button.addEventListener('click', function() {
        const studentId = this.getAttribute('data-id');
        // Load student data and open edit modal
        // ...
      });
    });
    
    // Delete student
    document.querySelectorAll('.delete-student').forEach(button => {
      button.addEventListener('click', function() {
        const studentId = this.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this student?')) {
          fetch(`/api/students/${studentId}`, {
            method: 'DELETE'
          })
          .then(response => response.json())
          .then(data => {
            loadStudents();
          })
          .catch(error => {
            console.error('Error deleting student:', error);
          });
        }
      });
    });
  }
  
  // Similar functions for teachers, classes, subjects, and grades
  // ...
});
