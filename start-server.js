const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 8000;

// Enable CORS for all origins during development
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Needed for cloud-based databases
  },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL!"))
  .catch(err => console.error("❌ Database connection error:", err));

module.exports = pool;

// Initialize database
const initDatabase = async () => {
  try {
    const initSQL = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    await pool.query(initSQL);
    console.log('✅ Database initialized successfully!');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};

// Call this before starting your server
initDatabase();

// GET endpoint to fetch all subjects
app.get('/api/subjects', async (req, res) => {
  try {
    console.log('GET /api/subjects called');
    const result = await pool.query('SELECT * FROM subject ORDER BY subject_id');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to add a new subject
app.post('/api/subjects', async (req, res) => {
  try {
    const { subjectName } = req.body;
    const result = await pool.query(
      'INSERT INTO subject (subject_name) VALUES ($1) RETURNING *',
      [subjectName]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding subject:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all classes
app.get('/api/classes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        class_id, 
        grade_level, 
        section, 
        school_year, 
        class_description
      FROM class
      ORDER BY grade_level, section
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to add a new class
app.post('/api/classes', async (req, res) => {
  try {
    const { grade_level, section, school_year, class_description } = req.body;
    
    // Validate required fields
    if (!grade_level || !section || !school_year) {
      return res.status(400).json({ error: 'Grade level, section, and school year are required' });
    }
    
    // Insert the new class with class_description
    const result = await pool.query(
      'INSERT INTO class (grade_level, section, school_year, class_description) VALUES ($1, $2, $3, $4) RETURNING *',
      [grade_level, section, school_year, class_description]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subjects for a specific class with teacher information
app.get('/api/classes/:classId/subjects', async (req, res) => {
  try {
    const { classId } = req.params;
    
    // Join query to get subject and teacher information
    const result = await pool.query(
      `SELECT cs.*, s.subject_name, 
              t.fname || ' ' || t.lname AS teacher_name, 
              t.gender AS teacher_gender
       FROM class_subject cs
       JOIN subject s ON cs.subject_id = s.subject_id
       LEFT JOIN teacher t ON cs.teacher_id = t.teacher_id
       WHERE cs.class_id = $1`,
      [classId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class subjects:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Add this endpoint to assign a subject to a class
app.post('/api/classes/:classId/subjects', async (req, res) => {
  try {
    const { classId } = req.params;
    const { subject_id, teacher_id } = req.body;
    
    // Insert into class_subject table
    const result = await pool.query(
      'INSERT INTO class_subject (class_id, subject_id, teacher_id) VALUES ($1, $2, $3) RETURNING *',
      [classId, subject_id, teacher_id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error assigning subject:', error);
    res.status(500).json({ error: 'Failed to assign subject' });
  }
});

// GET endpoint to fetch all teachers
app.get('/api/teachers', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.teacher_id,
        t.fname,
        t.mname,
        t.lname,
        t.gender,
        t.status  -- Make sure status is included in the SELECT
      FROM teacher t
      ORDER BY t.lname, t.fname
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to add a new teacher
app.post('/api/teachers', async (req, res) => {
  try {
    const { teacherId, fname, mname, lname, gender, status = 'ACTIVE' } = req.body;
    
    const result = await pool.query(
      'INSERT INTO teacher (teacher_id, fname, mname, lname, gender, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [teacherId, fname, mname, lname, gender, status]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT endpoint to update teacher status
app.put('/api/teachers/:teacherId/status', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { status } = req.body; // This will be a boolean
    
    const query = `
      UPDATE teacher 
      SET status = $1 
      WHERE teacher_id = $2 
      RETURNING *
    `;
    
    const result = await pool.query(query, [status, teacherId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating teacher status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/school-year', async (req, res) => {
  try {
    const query = 'SELECT * FROM school_year';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching school years:', error);
    res.status(500).json({ error: 'Failed to fetch school years' });
  }
});

// Get all school years with active status
app.get('/api/school-years', async (req, res) => {
  try {
    const query = `
      SELECT 
        school_year,
        is_active
      FROM school_year
      ORDER BY 
        is_active DESC,
        school_year DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching school years:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add this login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Query the database to find the user
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      // Send back user data and type
      res.json({
        success: true,
        token: 'dummy-token', // You might want to implement proper JWT tokens
        userType: user.user_type, // 'admin' or 'teacher'
        user: {
          id: user.user_id,
          username: user.username,
          name: user.name
        }
      });
    } else {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// GET endpoint to fetch all users
app.get('/users', async (req, res) => {
  try {
    console.log('GET /users called');
    const result = await pool.query(
      'SELECT user_id, username, user_type, flag FROM users ORDER BY user_id'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to add a new user
app.post('/users', async (req, res) => {
  try {
    const { username, password, userType } = req.body;
    const result = await pool.query(
      'INSERT INTO users (username, password, user_type) VALUES ($1, $2, $3) RETURNING user_id, username, user_type, flag',
      [username, password, userType]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT endpoint to update a user
app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, userType, flag } = req.body;
    const result = await pool.query(
      'UPDATE users SET username = $1, user_type = $2, flag = $3 WHERE user_id = $4 RETURNING user_id, username, user_type, flag',
      [username, userType, flag, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE endpoint to remove a user
app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM users WHERE user_id = $1 RETURNING user_id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all students (for the dropdown)
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM student ORDER BY lname, fname');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get students for a specific class
app.get('/api/classes/:classId/students', async (req, res) => {
  try {
    const { classId } = req.params;
    
    // Join class_student with student table to get student details
    const result = await pool.query(`
      SELECT s.student_id, s.fname, s.mname, s.lname, s.gender, s.age
      FROM class_student cs
      JOIN student s ON cs.student_id = s.student_id
      WHERE cs.class_id = $1
    `, [classId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign a student to a class
app.post('/api/classes/:classId/students', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { classId } = req.params;
    const { student_id } = req.body;
    
    // Get the school year for this class
    const classResult = await client.query(
      'SELECT school_year FROM class WHERE class_id = $1',
      [classId]
    );
    
    if (classResult.rows.length === 0) {
      throw new Error('Class not found');
    }
    
    const { school_year } = classResult.rows[0];
    
    // Check if student is already assigned to a class in this school year
    const existingAssignment = await client.query(
      `SELECT cs.class_id, c.grade_level, c.section 
       FROM class_student cs
       JOIN class c ON cs.class_id = c.class_id
       WHERE cs.student_id = $1 AND c.school_year = $2`,
      [student_id, school_year]
    );
    
    if (existingAssignment.rows.length > 0) {
      const existing = existingAssignment.rows[0];
      throw new Error(`Student is already assigned to Grade ${existing.grade_level}-${existing.section} for school year ${school_year}`);
    }
    
    // Insert into class_student table
    const result = await client.query(
      'INSERT INTO class_student (class_id, student_id) VALUES ($1, $2) RETURNING *',
      [classId, student_id]
    );
    
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning student:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get information for a specific class
app.get('/api/classes/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        class_id, 
        grade_level, 
        section, 
        school_year, 
        class_description
      FROM class
      WHERE class_id = $1
    `, [classId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching class information:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET endpoint to fetch academic rankings
app.get('/api/academic-rankings', async (req, res) => {
  try {
    const { schoolYear, quarter, gradeLevel, section } = req.query;

    let query = `
      WITH student_averages AS (
        SELECT 
          s.student_id,
          s.fname,
          s.lname,
          c.grade_level,
          c.section,
          ROUND(AVG(sg.grade)::numeric, 2) as average
        FROM student s
        JOIN class_student cs ON s.student_id = cs.student_id
        JOIN class c ON cs.class_id = c.class_id
        JOIN student_grade sg ON s.student_id = sg.student_id
        WHERE 
          c.school_year = $1 
          AND sg.quarter = $2
    `;

    const queryParams = [schoolYear, quarter];
    let paramCount = 2;

    if (gradeLevel && gradeLevel !== 'All Grades (Campus-wide)') {
      queryParams.push(gradeLevel);
      query += ` AND c.grade_level = $${++paramCount}`;
    }

    if (section && section !== 'Select Section') {
      queryParams.push(section);
      query += ` AND c.section = $${++paramCount}`;
    }

    query += `
        GROUP BY s.student_id, s.fname, s.lname, c.grade_level, c.section
      )
      SELECT *
      FROM student_averages
      ORDER BY average DESC
    `;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching academic rankings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add an endpoint for final average across all quarters
app.get('/api/academic-rankings/final', async (req, res) => {
  try {
    const { schoolYearId, gradeLevel, section } = req.query;
    
    // Validate required parameters
    if (!schoolYearId || !gradeLevel || !section) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Query for final average across all quarters
    const query = `
      SELECT 
        s.student_id,
        s.fname,
        s.mname,
        s.lname,
        ROUND(AVG(sg.grade)::numeric, 2) as average_grade,
        RANK() OVER (ORDER BY AVG(sg.grade) DESC) as rank
      FROM student s
      JOIN class_student cs ON s.student_id = cs.student_id
      JOIN class c ON cs.class_id = c.class_id
      JOIN student_grade sg ON s.student_id = sg.student_id AND cs.class_id = sg.class_id
      WHERE 
        c.school_year = (SELECT school_year FROM school_year WHERE school_year_id = $1)
        AND c.grade_level = $2
        AND c.section = $3
      GROUP BY s.student_id, s.fname, s.mname, s.lname
      ORDER BY average_grade DESC
    `;
    
    const result = await pool.query(query, [schoolYearId, gradeLevel, section]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching final academic rankings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET endpoint to fetch campus-wide academic rankings
app.get('/api/academic-rankings/campus', async (req, res) => {
  try {
    const { schoolYearId, quarter } = req.query;
    
    // Validate required parameters
    if (!schoolYearId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    let query;
    let params;
    
    if (quarter === 'final') {
      // For final average across all quarters
      query = `
        SELECT 
          s.student_id,
          s.fname,
          s.mname,
          s.lname,
          c.grade_level,
          c.section,
          ROUND(AVG(sg.grade)::numeric, 2) as average_grade,
          RANK() OVER (ORDER BY AVG(sg.grade) DESC) as rank
        FROM student s
        JOIN class_student cs ON s.student_id = cs.student_id
        JOIN class c ON cs.class_id = c.class_id
        JOIN student_grade sg ON s.student_id = sg.student_id AND cs.class_id = sg.class_id
        WHERE 
          c.school_year = (SELECT school_year FROM school_year WHERE school_year_id = $1)
        GROUP BY s.student_id, s.fname, s.mname, s.lname, c.grade_level, c.section
        ORDER BY average_grade DESC
      `;
      params = [schoolYearId];
    } else {
      // For specific quarter
      query = `
        SELECT 
          s.student_id,
          s.fname,
          s.mname,
          s.lname,
          c.grade_level,
          c.section,
          ROUND(AVG(sg.grade)::numeric, 2) as average_grade,
          RANK() OVER (ORDER BY AVG(sg.grade) DESC) as rank
        FROM student s
        JOIN class_student cs ON s.student_id = cs.student_id
        JOIN class c ON cs.class_id = c.class_id
        JOIN student_grade sg ON s.student_id = sg.student_id AND cs.class_id = sg.class_id
        WHERE 
          c.school_year = (SELECT school_year FROM school_year WHERE school_year_id = $1)
          AND sg.quarter = $2
        GROUP BY s.student_id, s.fname, s.mname, s.lname, c.grade_level, c.section
        ORDER BY average_grade DESC
      `;
      params = [schoolYearId, quarter];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching campus-wide rankings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add this new endpoint to check quarters
app.get('/api/academic-rankings/check-quarters', async (req, res) => {
  try {
    const { schoolYearId, gradeLevel, section } = req.query;
    
    let query = `
      SELECT DISTINCT quarter 
      FROM student_grade sg
      JOIN class_student cs ON sg.student_id = cs.student_id AND sg.class_id = cs.class_id
      JOIN class c ON cs.class_id = c.class_id
      WHERE c.school_year = (SELECT school_year FROM school_year WHERE school_year_id = $1)
    `;
    const params = [schoolYearId];

    if (gradeLevel && gradeLevel !== 'all') {
      query += ' AND c.grade_level = $2';
      params.push(gradeLevel);
    }
    if (section) {
      query += ' AND c.section = $3';
      params.push(section);
    }

    const result = await pool.query(query, params);
    
    // Check if grades exist for all quarters (1-4)
    const completedQuarters = result.rows.map(row => row.quarter);
    const allQuartersComplete = [1, 2, 3, 4].every(q => completedQuarters.includes(q));

    res.json({
      allQuartersComplete,
      completedQuarters
    });

  } catch (error) {
    console.error('Error checking quarters:', error);
    res.status(500).json({ error: 'Failed to check quarters' });
  }
});

// PATCH endpoint to update a subject
app.patch('/api/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { subject_name } = req.body;  // Changed from subjectName to subject_name
    
    const result = await pool.query(
      'UPDATE subject SET subject_name = $1 WHERE subject_id = $2 RETURNING *',
      [subject_name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating subject:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subjects for a specific class
app.get('/api/class-subjects/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const query = `
      SELECT DISTINCT s.subject_id, s.subject_name
      FROM subject s
      JOIN class_subject cs ON s.subject_id = cs.subject_id
      WHERE cs.class_id = $1
      ORDER BY s.subject_name
    `;
    const result = await pool.query(query, [classId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class subjects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get student grades for a specific class
app.get('/api/student-grades/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const query = `
      SELECT 
        s.student_id,
        s.fname,
        s.mname,
        s.lname,
        json_object_agg(sg.subject_id, sg.grade) as grades
      FROM student s
      JOIN class_student cs ON s.student_id = cs.student_id
      LEFT JOIN student_grade sg ON s.student_id = sg.student_id AND cs.class_id = sg.class_id
      WHERE cs.class_id = $1
      GROUP BY s.student_id, s.fname, s.mname, s.lname
      ORDER BY s.lname, s.fname
    `;
    const result = await pool.query(query, [classId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching student grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get students for a specific teacher
app.get('/api/teacher-students/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const query = `
      SELECT DISTINCT s.student_id, s.fname, s.mname, s.lname, 
             c.grade_level, c.section
      FROM student s
      JOIN class_student cs ON s.student_id = cs.student_id
      JOIN class c ON cs.class_id = c.class_id
      JOIN class_subject csub ON c.class_id = csub.class_id
      JOIN school_year sy ON csub.school_year_id = sy.school_year_id
      WHERE csub.teacher_id = $1 
      AND sy.is_active = true
      ORDER BY s.lname, s.fname
    `;
    
    const result = await pool.query(query, [teacherId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error details:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get student_id from users table
app.get('/api/get-student-id/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate userId
    if (!userId || userId === 'null' || userId === 'undefined' || isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        message: 'Please log in again' 
      });
    }

    const query = `
      SELECT s.student_id 
      FROM student s 
      JOIN users u ON s.user_id = u.user_id 
      WHERE u.user_id = $1 AND u.user_type = 'student'
    `;
    
    const result = await pool.query(query, [parseInt(userId)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting student_id:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Please ensure you are logged in as a student' 
    });
  }
});

// Update the student grades endpoint
app.get('/api/student-grades/:studentId/:schoolYear', async (req, res) => {
  try {
    const { studentId, schoolYear } = req.params;

    // Check if student has a class assigned
    const classQuery = `
      SELECT cs.class_id 
      FROM class_student cs
      JOIN class c ON cs.class_id = c.class_id
      WHERE cs.student_id = $1 AND c.school_year = $2
    `;
    
    const classResult = await pool.query(classQuery, [studentId, schoolYear]);
    
    if (classResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'No class assigned for this school year' 
      });
    }

    const classId = classResult.rows[0].class_id;

    // Check if class has subjects assigned
    const subjectQuery = `
      SELECT COUNT(*) 
      FROM class_subject 
      WHERE class_id = $1
    `;
    
    const subjectResult = await pool.query(subjectQuery, [classId]);
    
    if (parseInt(subjectResult.rows[0].count) === 0) {
      return res.status(404).json({ 
        message: 'No subjects assigned to your class yet' 
      });
    }

    // Rest of the grades query remains the same...

    const query = `
      SELECT 
        s.subject_name,
        sg.quarter,
        sg.grade,
        CONCAT(t.fname, ' ', t.lname) as teacher_name,
        c.grade_level,
        c.section
      FROM student_grade sg
      JOIN subject s ON sg.subject_id = s.subject_id
      JOIN teacher t ON sg.teacher_id = t.teacher_id
      JOIN class c ON sg.class_id = c.class_id
      WHERE sg.student_id = $1 
      AND c.school_year = $2
      ORDER BY s.subject_name, sg.quarter
    `;

    const result = await pool.query(query, [studentId, schoolYear]);
    
    // Transform the data to group by subject
    const groupedGrades = result.rows.reduce((acc, row) => {
      const subject = row.subject_name;
      if (!acc[subject]) {
        acc[subject] = {
          subject: subject,
          teacher: row.teacher_name,
          q1: null,
          q2: null,
          q3: null,
          q4: null,
          final: null,
          remarks: 'Pending'
        };
      }
      acc[subject][`q${row.quarter}`] = parseFloat(row.grade);
      
      // Calculate final grade if all quarters are present
      if (acc[subject].q1 && acc[subject].q2 && acc[subject].q3 && acc[subject].q4) {
        acc[subject].final = ((acc[subject].q1 + acc[subject].q2 + acc[subject].q3 + acc[subject].q4) / 4).toFixed(2);
        acc[subject].remarks = parseFloat(acc[subject].final) >= 75 ? 'Passed' : 'Failed';
      }
      
      return acc;
    }, {});

    res.json(Object.values(groupedGrades));
  } catch (error) {
    console.error('Error fetching student grades:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Add new endpoint for admin to view all grades
app.get('/api/admin/all-grades/:schoolYear', async (req, res) => {
  try {
    const { schoolYear } = req.params;

    const query = `
      SELECT 
        s.student_id,
        s.fname,
        s.lname,
        sub.subject_name,
        sg.quarter,
        sg.grade,
        c.grade_level,
        c.section,
        CONCAT(t.fname, ' ', t.lname) as teacher_name
      FROM student s
      JOIN class_student cs ON s.student_id = cs.student_id
      JOIN class c ON cs.class_id = c.class_id
      JOIN class_subject csub ON c.class_id = csub.class_id
      JOIN subject sub ON csub.subject_id = sub.subject_id
      JOIN teacher t ON csub.teacher_id = t.teacher_id
      LEFT JOIN student_grade sg ON 
        sg.student_id = s.student_id AND
        sg.subject_id = sub.subject_id AND
        sg.class_id = c.class_id
      WHERE c.school_year = $1
      ORDER BY s.lname, s.fname, sub.subject_name, sg.quarter
    `;

    const result = await pool.query(query, [schoolYear]);

    // Transform the data to group by student and subject
    const groupedGrades = result.rows.reduce((acc, row) => {
      const studentKey = `${row.student_id}`;
      if (!acc[studentKey]) {
        acc[studentKey] = {
          student_id: row.student_id,
          student_name: `${row.fname} ${row.lname}`,
          grade_level: row.grade_level,
          section: row.section,
          subjects: {}
        };
      }

      const subjectKey = row.subject_name;
      if (!acc[studentKey].subjects[subjectKey]) {
        acc[studentKey].subjects[subjectKey] = {
          subject: subjectKey,
          teacher: row.teacher_name,
          q1: null,
          q2: null,
          q3: null,
          q4: null,
          final: null,
          remarks: 'Pending'
        };
      }

      if (row.quarter) {
        acc[studentKey].subjects[subjectKey][`q${row.quarter}`] = parseFloat(row.grade);
      }

      // Calculate final grade if all quarters exist
      const grades = [
        acc[studentKey].subjects[subjectKey].q1,
        acc[studentKey].subjects[subjectKey].q2,
        acc[studentKey].subjects[subjectKey].q3,
        acc[studentKey].subjects[subjectKey].q4
      ];

      if (grades.every(grade => grade !== null)) {
        const final = grades.reduce((sum, grade) => sum + grade, 0) / 4;
        acc[studentKey].subjects[subjectKey].final = final.toFixed(2);
        acc[studentKey].subjects[subjectKey].remarks = final >= 75 ? 'Passed' : 'Failed';
      }

      return acc;
    }, {});

    res.json(Object.values(groupedGrades));
  } catch (error) {
    console.error('Error fetching all grades:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get grades for a specific class
app.get('/api/class-grades/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    
    const query = `
      SELECT 
        s.student_id,
        s.fname,
        s.lname,
        json_object_agg(
          sg.subject_id,
          CASE 
            WHEN COUNT(sg.grade) = 4 
            THEN ROUND(AVG(sg.grade)::numeric, 2)
            ELSE NULL 
          END
        ) as grades
      FROM class_student cs
      JOIN student s ON cs.student_id = s.student_id
      LEFT JOIN student_grade sg ON s.student_id = sg.student_id
      WHERE cs.class_id = $1
      GROUP BY s.student_id, s.fname, s.lname
      ORDER BY s.lname, s.fname
    `;

    const result = await pool.query(query, [classId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active school year
app.get('/api/active-school-year', async (req, res) => {
  try {
    const query = `
      SELECT school_year
      FROM school_year
      WHERE is_active = true
      LIMIT 1
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No active school year found' });
      return;
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching active school year:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE endpoint for subjects
app.delete('/api/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM subject WHERE subject_id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    console.error('Error deleting subject:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE endpoint for classes
app.delete('/api/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM class WHERE class_id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Error deleting class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE endpoint for teachers
app.delete('/api/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM teacher WHERE teacher_id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE endpoint for students
app.delete('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM student WHERE student_id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH endpoint to update a subject
app.patch('/api/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { subject_name } = req.body;  // Changed from subjectName to subject_name
    
    const result = await pool.query(
      'UPDATE subject SET subject_name = $1 WHERE subject_id = $2 RETURNING *',
      [subject_name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating subject:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH endpoint to update a class
app.patch('/api/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { grade_level, section, school_year, class_description } = req.body;
    
    const result = await pool.query(
      'UPDATE class SET grade_level = $1, section = $2, school_year = $3, class_description = $4 WHERE class_id = $5 RETURNING *',
      [grade_level, section, school_year, class_description, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH endpoint to update a teacher
app.patch('/api/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fname, mname, lname, gender } = req.body;
    
    const result = await pool.query(
      'UPDATE teacher SET fname = $1, mname = $2, lname = $3, gender = $4 WHERE teacher_id = $5 RETURNING *',
      [fname, mname, lname, gender, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH endpoint to update a student
app.patch('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fname, mname, lname, gender, age } = req.body;
    
    const result = await pool.query(
      'UPDATE student SET fname = $1, mname = $2, lname = $3, gender = $4, age = $5 WHERE student_id = $6 RETURNING *',
      [fname, mname, lname, gender, age, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH endpoint to update a school year
app.patch('/api/school-years/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { school_year, is_active } = req.body;
    
    const result = await pool.query(
      'UPDATE school_year SET school_year = $1, is_active = $2 WHERE school_year_id = $3 RETURNING *',
      [school_year, is_active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School year not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating school year:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add GET endpoint for single subject
app.get('/api/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM subject WHERE subject_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching subject:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add GET endpoint for single class
app.get('/api/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM class WHERE class_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add GET endpoint for single teacher
app.get('/api/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM teacher WHERE teacher_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add GET endpoint for single student
app.get('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM student WHERE student_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// First add the DELETE endpoint for school year
app.delete('/api/school-years/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM school_year WHERE school_year_id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School year not found' });
    }
    res.json({ message: 'School year deleted successfully' });
  } catch (error) {
    console.error('Error deleting school year:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add GET endpoint for single school year
app.get('/api/school-years/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM school_year WHERE school_year_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School year not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching school year:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//THE API ENDPOINTS FRONTEND
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>School Management System</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
      <style>
        :root {
          --primary-color: #4F46E5;
          --primary-hover: #4338CA;
          --secondary-color: #10B981;
          --secondary-hover: #059669;
          --background-color: #F3F4F6;
          --surface-color: #FFFFFF;
          --text-primary: #111827;
          --text-secondary: #6B7280;
          --border-color: #E5E7EB;
          --danger-color: #EF4444;
          --warning-color: #F59E0B;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
        }

        body {
          background-color: var(--background-color);
          color: var(--text-primary);
          line-height: 1.5;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .header {
          background-color: var(--surface-color);
          padding: 1rem 2rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary-color);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .nav-menu {
          display: flex;
          gap: 1rem;
          list-style: none;
        }

        .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: all 0.3s ease;
        }

        .nav-link:hover,
        .nav-link.active {
          background-color: var(--primary-color);
          color: white;
        }

        .main-content {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .card {
          background-color: var(--surface-color);
          border-radius: 0.75rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 1.5rem;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .card-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          font-weight: 500;
          border-radius: 0.5rem;
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-primary {
          background-color: var(--primary-color);
          color: white;
        }

        .btn-primary:hover {
          background-color: var(--primary-hover);
        }

        .table-container {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        th, td {
          padding: 1rem;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }

        th {
          background-color: #F9FAFB;
          font-weight: 600;
          color: var(--text-secondary);
        }

        tr:hover {
          background-color: #F9FAFB;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .badge.success {
          background-color: #D1FAE5;
          color: #065F46;
        }

        .badge.warning {
          background-color: #FEF3C7;
          color: #92400E;
        }

        .badge.danger {
          background-color: #FEE2E2;
          color: #991B1B;
        }

        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            gap: 1rem;
          }

          .nav-menu {
            flex-direction: column;
            width: 100%;
          }

          .nav-link {
            display: block;
            text-align: center;
          }

          .main-content {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <header class="header">
        <div class="header-content">
          <div class="logo">
            <i class="fas fa-graduation-cap"></i>
            <span>School Management System</span>
          </div>
          <nav>
            <ul class="nav-menu">
              <li><a href="#classes" class="nav-link active">Classes</a></li>
              <li><a href="#students" class="nav-link">Students</a></li>
              <li><a href="#teachers" class="nav-link">Teachers</a></li>
              <li><a href="#subjects" class="nav-link">Subjects</a></li>
              <li><a href="#grades" class="nav-link">Grades</a></li>
              <li><a href="#school-years" class="nav-link">School Years</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <div class="container mt-4">
        <div class="row">
          <div class="col-12">
            <!-- Classes Tab Content -->
            <div id="classesTab" class="tab-content card">
              <div class="card-header">
                <h2 class="card-title">Classes</h2>
                <button class="btn btn-primary" id="addClassBtn">
                  <i class="fas fa-plus"></i>
                  Add Class
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Grade Level</th>
                      <th>Section</th>
                      <th>School Year</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="classesTableBody"></tbody>
                </table>
              </div>
            </div>

            <!-- Students Tab Content -->
            <div id="studentsTab" class="tab-content card" style="display: none;">
              <div class="card-header">
                <h2 class="card-title">Students</h2>
                <button class="btn btn-primary">
                  <i class="fas fa-plus"></i>
                  Add Student
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="studentsTableBody"></tbody>
                </table>
              </div>
            </div>

            <!-- Teachers Tab Content -->
            <div id="teachersTab" class="tab-content card" style="display: none;">
              <div class="card-header">
                <h2 class="card-title">Teachers</h2>
                <button class="btn btn-primary">
                  <i class="fas fa-plus"></i>
                  Add Teacher
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Subjects</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="teachersTableBody"></tbody>
                </table>
              </div>
            </div>

            <!-- Subjects Tab Content -->
            <div id="subjectsTab" class="tab-content card" style="display: none;">
              <div class="card-header">
                <h2 class="card-title">Subjects</h2>
                <button class="btn btn-primary">
                  <i class="fas fa-plus"></i>
                  Add Subject
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Teachers</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="subjectsTableBody"></tbody>
                </table>
              </div>
            </div>

            <!-- Grades Tab Content -->
            <div id="gradesTab" class="tab-content card" style="display: none;">
              <div class="card-header">
                <h2 class="card-title">Grades</h2>
                <button class="btn btn-primary">
                  <i class="fas fa-plus"></i>
                  Add Grade
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Subject</th>
                      <th>Grade</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="gradesTableBody"></tbody>
                </table>
              </div>
            </div>
            
            <!-- School Years Tab Content -->
            <div id="schoolYearsTab" class="tab-content card" style="display: none;">
              <div class="card-header">
                <h2 class="card-title">School Years</h2>
                <button class="btn btn-primary" id="addSchoolYearBtn">
                  <i class="fas fa-plus"></i>
                  Add School Year
                </button>
              </div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Year Name</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="schoolYearsTableBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Login Modal -->
      <div class="modal fade" id="loginModal" tabindex="-1" role="dialog" aria-labelledby="loginModalLabel" aria-hidden="true">
        <!-- ... existing login modal code ... -->
      </div>

      <!-- School Year Modal -->
      <div class="modal fade" id="schoolYearModal" tabindex="-1" role="dialog" aria-labelledby="schoolYearModalLabel" aria-hidden="true">
        <!-- ... existing school year modal code ... -->
      </div>
      
      <!-- Class Modal -->
      <div class="modal fade" id="classModal" tabindex="-1" role="dialog" aria-labelledby="classModalLabel" aria-hidden="true">
        <div class="modal-dialog" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="classModalLabel">Add Class</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div class="modal-body">
              <form id="classForm">
                <input type="hidden" id="classId">
                <div class="form-group">
                  <label for="gradeLevel">Grade Level</label>
                  <input type="text" class="form-control" id="gradeLevel" required>
                </div>
                <div class="form-group">
                  <label for="section">Section</label>
                  <input type="text" class="form-control" id="section" required>
                </div>
                <div class="form-group">
                  <label for="classSchoolYear">School Year</label>
                  <select class="form-control" id="classSchoolYear" required>
                    <!-- School years will be loaded dynamically -->
                  </select>
                </div>
                <div class="form-group">
                  <label for="classDescription">Description</label>
                  <textarea class="form-control" id="classDescription" rows="3"></textarea>
                </div>
                <div id="classError" class="alert alert-danger mt-3" style="display: none;"></div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="saveClassBtn">Save</button>
            </div>
          </div>
        </div>
      </div>

      <script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.0/dist/js/bootstrap.min.js"></script>
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          // Function to show the selected tab content and hide others
          const showTab = (tabId) => {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(content => {
              content.style.display = 'none';
            });
            
            // Show the selected tab content
            const selectedContent = document.getElementById(tabId);
            if (selectedContent) {
              selectedContent.style.display = 'block';
            }
            
            // Load data for the tab if needed
            if (tabId === 'classesTab') {
              loadClasses();
              loadSchoolYearsForDropdown();
            } else if (tabId === 'schoolYearsTab') {
              loadSchoolYears();
            }
          };
          
          // Function to load school years for the dropdown
          const loadSchoolYearsForDropdown = async () => {
            try {
              const response = await fetch('/api/school-years');
              if (!response.ok) {
                throw new Error('Failed to fetch school years');
              }
              
              const data = await response.json();
              const schoolYears = data.data || [];
              
              const dropdown = document.getElementById('classSchoolYear');
              dropdown.innerHTML = '';
              
              schoolYears.forEach(year => {
                const option = document.createElement('option');
                option.value = year.school_year;
                option.textContent = year.school_year;
                option.selected = year.is_active;
                dropdown.appendChild(option);
              });
            } catch (error) {
              console.error('Error loading school years for dropdown:', error);
            }
          };
          
          // Function to load classes from the server
          const loadClasses = async () => {
            try {
              const response = await fetch('/api/classes');
              if (!response.ok) {
                throw new Error('Failed to fetch classes');
              }
              
              const classes = await response.json();
              renderClasses(classes);
            } catch (error) {
              console.error('Error loading classes:', error);
              alert('Failed to load classes. Please try again later.');
            }
          };
          
          // Function to render classes in the table
          const renderClasses = (classes) => {
            const tableBody = document.getElementById('classesTableBody');
            tableBody.innerHTML = '';
            
            if (classes.length === 0) {
              const row = document.createElement('tr');
              const cell = document.createElement('td');
              cell.colSpan = 4;
              cell.textContent = 'No classes found';
              cell.style.textAlign = 'center';
              row.appendChild(cell);
              tableBody.appendChild(row);
              return;
            }
            
            classes.forEach(cls => {
              const row = document.createElement('tr');
              
              // Grade Level
              const gradeLevelCell = document.createElement('td');
              gradeLevelCell.textContent = cls.grade_level;
              row.appendChild(gradeLevelCell);
              
              // Section
              const sectionCell = document.createElement('td');
              sectionCell.textContent = cls.section;
              row.appendChild(sectionCell);
              
              // School Year
              const schoolYearCell = document.createElement('td');
              schoolYearCell.textContent = cls.school_year;
              row.appendChild(schoolYearCell);
              
              // Actions
              const actionsCell = document.createElement('td');
              
              // View button
              const viewBtn = document.createElement('button');
              viewBtn.className = 'btn btn-sm btn-info mr-1';
              viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
              viewBtn.title = 'View Details';
              viewBtn.addEventListener('click', () => viewClassDetails(cls.class_id));
              actionsCell.appendChild(viewBtn);
              
              // Edit button
              const editBtn = document.createElement('button');
              editBtn.className = 'btn btn-sm btn-primary mr-1';
              editBtn.innerHTML = '<i class="fas fa-edit"></i>';
              editBtn.title = 'Edit Class';
              editBtn.addEventListener('click', () => editClass(cls));
              actionsCell.appendChild(editBtn);
              
              // Delete button
              const deleteBtn = document.createElement('button');
              deleteBtn.className = 'btn btn-sm btn-danger';
              deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
              deleteBtn.title = 'Delete Class';
              deleteBtn.addEventListener('click', () => deleteClass(cls.class_id));
              actionsCell.appendChild(deleteBtn);
              
              row.appendChild(actionsCell);
              tableBody.appendChild(row);
            });
          };
          
          // Add Class button handler
          const addClassBtn = document.getElementById('addClassBtn');
          addClassBtn.addEventListener('click', () => {
            // Reset form
            document.getElementById('classForm').reset();
            document.getElementById('classId').value = '';
            document.getElementById('classModalLabel').textContent = 'Add Class';
            document.getElementById('classError').style.display = 'none';
            
            // Show modal
            $('#classModal').modal('show');
          });
          
          // Save Class button handler
          const saveClassBtn = document.getElementById('saveClassBtn');
          saveClassBtn.addEventListener('click', async () => {
            const classId = document.getElementById('classId').value;
            const gradeLevel = document.getElementById('gradeLevel').value;
            const section = document.getElementById('section').value;
            const schoolYear = document.getElementById('classSchoolYear').value;
            const classDescription = document.getElementById('classDescription').value;
            
            // Validate form
            if (!gradeLevel || !section || !schoolYear) {
              document.getElementById('classError').textContent = 'Please fill in all required fields';
              document.getElementById('classError').style.display = 'block';
              return;
            }
            
            try {
              let url = '/api/classes';
              let method = 'POST';
              
              if (classId) {
                url = '/api/classes/' + classId;
                method = 'PATCH';
              }
              
              const response = await fetch(url, {
                method,
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  grade_level: gradeLevel,
                  section,
                  school_year: schoolYear,
                  class_description: classDescription
                })
              });
              
              if (!response.ok) {
                throw new Error('Failed to save class');
              }
              
              // Close modal and reload classes
              $('#classModal').modal('hide');
              loadClasses();
            } catch (error) {
              console.error('Error saving class:', error);
              document.getElementById('classError').textContent = 'Failed to save class. Please try again.';
              document.getElementById('classError').style.display = 'block';
            }
          });
          
          // Function to view class details
          const viewClassDetails = (classId) => {
            // In a real application, you would fetch and display detailed information
            window.location.href = '/class-details.html?id=' + classId;
          };
          
          // Function to edit a class
          const editClass = (cls) => {
            document.getElementById('classId').value = cls.class_id;
            document.getElementById('gradeLevel').value = cls.grade_level;
            document.getElementById('section').value = cls.section;
            document.getElementById('classSchoolYear').value = cls.school_year;
            document.getElementById('classDescription').value = cls.class_description || '';
            document.getElementById('classModalLabel').textContent = 'Edit Class';
            document.getElementById('classError').style.display = 'none';
            
            // Show modal
            $('#classModal').modal('show');
          };
          
          // Function to delete a class
          const deleteClass = async (classId) => {
            if (confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
              try {
                const response = await fetch('/api/classes/' + classId, {
                  method: 'DELETE'
                });
                
                if (!response.ok) {
                  throw new Error('Failed to delete class');
                }
                
                // Reload classes
                loadClasses();
              } catch (error) {
                console.error('Error deleting class:', error);
                alert('Failed to delete class. Please try again.');
              }
            }
          };
          
          // Add click handlers for navigation
          document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
              e.preventDefault();
              
              // Update active class
              document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
              e.target.classList.add('active');
              
              // Get the tab to show based on the link text
              const tabText = e.target.textContent.trim();
              const tabMap = {
                'Classes': 'classesTab',
                'Students': 'studentsTab',
                'Teachers': 'teachersTab',
                'Subjects': 'subjectsTab',
                'Grades': 'gradesTab',
                'School Years': 'schoolYearsTab'
              };
              
              if (tabMap[tabText]) {
                showTab(tabMap[tabText]);
              }
            });
          });
          
          // Show the Classes tab by default and load the data
          showTab('classesTab');
        });
      </script>
    </body>
    </html>
  `);
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 
