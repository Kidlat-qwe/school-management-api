const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { 
  initializeDatabase, 
  getStudents, 
  getTeachers, 
  getSubjects, 
  getClasses, 
  getStudentGrades, 
  getClassSubjects, 
  getClassStudents, 
  getActiveSchoolYear,
  pool 
} = require('./db-init');

const app = express();
const port = process.env.PORT || 8000;

// Enable CORS for all origins during development
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'API is running' });
});

// Endpoint to initialize database from grade.sql
app.post('/api/init-db', async (req, res) => {
  try {
    const result = await initializeDatabase();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get all students
app.get('/api/students', async (req, res) => {
  try {
    const result = await getStudents();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get all teachers
app.get('/api/teachers', async (req, res) => {
  try {
    const result = await getTeachers();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get all subjects
app.get('/api/subjects', async (req, res) => {
  try {
    const result = await getSubjects();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get all classes
app.get('/api/classes', async (req, res) => {
  try {
    const result = await getClasses();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get student grades (all or by student ID)
app.get('/api/grades', async (req, res) => {
  try {
    const studentId = req.query.studentId ? parseInt(req.query.studentId) : null;
    const result = await getStudentGrades(studentId);
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get class subjects (all or by class ID)
app.get('/api/class-subjects', async (req, res) => {
  try {
    const classId = req.query.classId ? parseInt(req.query.classId) : null;
    const result = await getClassSubjects(classId);
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get class students (all or by class ID)
app.get('/api/class-students', async (req, res) => {
  try {
    const classId = req.query.classId ? parseInt(req.query.classId) : null;
    const result = await getClassStudents(classId);
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get active school year
app.get('/api/active-school-year', async (req, res) => {
  try {
    const result = await getActiveSchoolYear();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User authentication endpoint (basic implementation)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // In a real application, you would hash the password and compare with the stored hash
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Get additional user details based on user type
    let userDetails = null;
    if (user.user_type === 'student') {
      const studentResult = await pool.query('SELECT * FROM student WHERE user_id = $1', [user.user_id]);
      if (studentResult.rows.length > 0) {
        userDetails = studentResult.rows[0];
      }
    } else if (user.user_type === 'teacher') {
      const teacherResult = await pool.query('SELECT * FROM teacher WHERE user_id = $1', [user.user_id]);
      if (teacherResult.rows.length > 0) {
        userDetails = teacherResult.rows[0];
      }
    }
    
    // In a real application, you would generate a JWT token here
    res.json({
      user_id: user.user_id,
      username: user.username,
      user_type: user.user_type,
      details: userDetails
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  pool.end();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  pool.end();
  process.exit(0);
});
