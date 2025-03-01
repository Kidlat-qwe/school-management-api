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
    
    // Map the results to ensure grade_level doesn't have duplicate "Grade" prefix
    const classes = result.rows.map(cls => ({
      ...cls,
      grade_level: cls.grade_level.toString().replace(/^Grade\s+/i, '')
    }));
    
    res.json(classes);
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
      <title>School DB API v1.0</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          max-width: 1200px;
          margin: 20px auto;
          padding: 0 20px;
          line-height: 1.4;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        h1 {
          color: #2c3e50;
          grid-column: 1 / -1;
          margin: 0 0 20px 0;
          border-bottom: 2px solid #eee;
          padding-bottom: 10px;
        }
        .section {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
        }
        h2 {
          color: #2980b9;
          margin: 0 0 15px 0;
          font-size: 1.2em;
        }
        .endpoint {
          margin: 8px 0;
          font-size: 0.9em;
        }
        .get .method { color: #27ae60; }
        .post .method { color: #e67e22; }
        .put .method { color: #2980b9; }
        .delete .method { color: #c0392b; }
        .method {
          display: inline-block;
          font-weight: bold;
          width: 45px;
          font-size: 0.9em;
        }
        .path {
          font-family: monospace;
          background: #fff;
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .form-group {
          margin: 10px 0;
        }
        input, button {
          margin: 5px 0;
          padding: 4px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        button {
          background: #3498db;
          color: white;
          border: none;
          cursor: pointer;
        }
        button:hover {
          background: #2980b9;
        }
        .response {
          margin-top: 10px;
          padding: 8px;
          background: #fff;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.8em;
          word-break: break-all;
          display: none;
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid #eee;
        }
        
        .response::-webkit-scrollbar {
          width: 8px;
        }
        
        .response::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        
        .response::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }
        
        .response::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        
        .response pre {
          margin: 0;
          padding-right: 10px;
        }
        
        .button-group {
          display: flex;
          gap: 5px;
        }
        
        .close-btn {
          background: #e74c3c;
        }
        
        .close-btn:hover {
          background: #c0392b;
        }
        
        .form-group input {
          width: calc(100% - 16px);
          margin: 4px 0;
        }
        
        .form-row {
          display: flex;
          gap: 10px;
        }
        
        .form-row input {
          flex: 1;
        }
        .delete-btn {
          background: #e74c3c;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .delete-btn:hover {
          background: #c0392b;
        }
        /* Add styles for the delete dialog */
        .delete-dialog {
          display: none;
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 1000;
        }
        .delete-dialog h3 {
          margin-top: 0;
        }
        .delete-dialog select {
          width: 100%;
          margin: 10px 0;
          padding: 5px;
        }
        .delete-dialog .button-group {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 15px;
        }
        .overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 999;
        }
        .delete-form {
          margin: 15px 0;
        }
        .delete-form .form-group {
          margin: 10px 0;
        }
        .delete-form label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .delete-form select,
        .delete-form input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-top: 5px;
        }
        
        /* Add styles for edit dialog */
        .edit-dialog {
          display: none;
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 1000;
          min-width: 300px;
        }
        
        .edit-btn {
          background: #3498db;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          margin: 0 5px;
        }
        
        .edit-btn:hover {
          background: #2980b9;
        }
        
        .edit-form {
          margin: 15px 0;
        }
        
        .edit-form .form-group {
          margin: 10px 0;
        }
        
        .edit-form label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .edit-form input,
        .edit-form select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-top: 5px;
        }
      </style>
    </head>
    <body>
      <h1>School DB API v1.0</h1>

      <div class="section">
        <h2>Subjects</h2>
        <div class="endpoint get">
          <span class="method">GET</span>
          <span class="path">/api/subjects</span>
          <div class="button-group">
            <button onclick="fetchSubjects()">Try it</button>
            <button class="close-btn" onclick="toggleResponse('subjectsResponse')">Close</button>
          </div>
          <div id="subjectsResponse" class="response"></div>
        </div>
        <div class="endpoint post">
          <span class="method">POST</span>
          <span class="path">/api/subjects</span>
          <div class="form-group">
            <input type="text" id="subjectName" placeholder="Subject Name">
            <div class="button-group">
              <button onclick="addSubject()" class="add-btn">Add Subject</button>
              <button onclick="showEditDialog('subject')" class="edit-btn">Edit Subject</button>
              <button onclick="deleteSubject()" class="delete-btn">Delete Subject</button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Classes</h2>
        <div class="endpoint get">
          <span class="method">GET</span>
          <span class="path">/api/classes</span>
          <div class="button-group">
            <button onclick="fetchClasses()">Try it</button>
            <button class="close-btn" onclick="toggleResponse('classesResponse')">Close</button>
          </div>
          <div id="classesResponse" class="response"></div>
        </div>
        <div class="endpoint post">
          <span class="method">POST</span>
          <span class="path">/api/classes</span>
          <div class="form-group">
            <input type="text" id="gradeLevel" placeholder="Grade Level">
            <input type="text" id="section" placeholder="Section">
            <input type="text" id="schoolYear" placeholder="School Year">
            <input type="text" id="classDescription" placeholder="Description">
            <div class="button-group">
              <button onclick="addClass()" class="add-btn">Add Class</button>
              <button onclick="showEditDialog('class')" class="edit-btn">Edit Class</button>
              <button onclick="deleteClass()" class="delete-btn">Delete Class</button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Teachers</h2>
        <div class="endpoint get">
          <span class="method">GET</span>
          <span class="path">/api/teachers</span>
          <div class="button-group">
            <button onclick="fetchTeachers()">Try it</button>
            <button class="close-btn" onclick="toggleResponse('teachersResponse')">Close</button>
          </div>
          <div id="teachersResponse" class="response"></div>
        </div>
        <div class="endpoint post">
          <span class="method">POST</span>
          <span class="path">/api/teachers</span>
          <div class="form-group">
            <input type="text" id="teacherId" placeholder="Teacher ID">
            <input type="text" id="fname" placeholder="First Name">
            <input type="text" id="mname" placeholder="Middle Name">
            <input type="text" id="lname" placeholder="Last Name">
            <input type="text" id="gender" placeholder="Gender">
            <div class="button-group">
              <button onclick="addTeacher()" class="add-btn">Add Teacher</button>
              <button onclick="showEditDialog('teacher')" class="edit-btn">Edit Teacher</button>
              <button onclick="deleteTeacher()" class="delete-btn">Delete Teacher</button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Students</h2>
        <div class="endpoint get">
          <span class="method">GET</span>
          <span class="path">/api/students</span>
          <div class="button-group">
            <button onclick="fetchStudents()">Try it</button>
            <button class="close-btn" onclick="toggleResponse('studentsResponse')">Close</button>
          </div>
          <div id="studentsResponse" class="response"></div>
        </div>
        <div class="endpoint post">
          <span class="method">POST</span>
          <span class="path">/api/students</span>
          <div class="form-group">
            <input type="text" id="studentFname" placeholder="First Name">
            <input type="text" id="studentMname" placeholder="Middle Name">
            <input type="text" id="studentLname" placeholder="Last Name">
            <input type="text" id="studentGender" placeholder="Gender">
            <input type="number" id="studentAge" placeholder="Age">
            <div class="button-group">
              <button onclick="addStudent()" class="add-btn">Add Student</button>
              <button onclick="showEditDialog('student')" class="edit-btn">Edit Student</button>
              <button onclick="deleteStudent()" class="delete-btn">Delete Student</button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>School Year</h2>
        <div class="endpoint get">
          <span class="method">GET</span>
          <span class="path">/api/school-years</span>
          <div class="button-group">
            <button onclick="fetchSchoolYears()">Try it</button>
            <button class="close-btn" onclick="toggleResponse('schoolYearsResponse')">Close</button>
          </div>
          <div id="schoolYearsResponse" class="response"></div>
        </div>
        <div class="endpoint post">
          <span class="method">POST</span>
          <span class="path">/api/school-years</span>
          <div class="form-group">
            <input type="text" id="schoolYear" placeholder="School Year (e.g., 2023-2024)">
            <div class="button-group">
              <button onclick="addSchoolYear()" class="add-btn">Add School Year</button>
              <button onclick="showEditDialog('schoolYear')" class="edit-btn">Edit School Year</button>
              <button onclick="deleteSchoolYear()" class="delete-btn">Delete School Year</button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Authentication</h2>
        <div class="endpoint post">
          <span class="method">POST</span>
          <span class="path">/auth/login</span>
        </div>
      </div>

      <!-- Add edit dialog for School Year -->
      <div id="editSchoolYearDialog" class="edit-dialog">
        <h3>Edit School Year</h3>
        <div class="edit-form">
          <div class="form-group">
            <label>Select School Year:</label>
            <select id="editSchoolYearSelect" onchange="loadSchoolYearData()"></select>
          </div>
          <div class="form-group">
            <label>School Year:</label>
            <input type="text" id="editSchoolYearInput">
          </div>
          <div class="form-group">
            <label>Status:</label>
            <select id="editSchoolYearStatus">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeEditDialog('editSchoolYearDialog')">Cancel</button>
          <button class="edit-btn" onclick="confirmEdit('schoolYear')">Save Changes</button>
        </div>
      </div>

      <!-- Add delete dialog for School Year -->
      <div id="deleteSchoolYearDialog" class="delete-dialog">
        <h3>Delete School Year</h3>
        <div class="delete-form">
          <div class="form-group">
            <label>Select School Year:</label>
            <select id="schoolYearSelect" onchange="updateIdField('schoolYear')"></select>
          </div>
          <div class="form-group">
            <label>Or Enter School Year ID:</label>
            <input type="text" id="schoolYearId" placeholder="Enter School Year ID">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeDeleteDialog('deleteSchoolYearDialog')">Cancel</button>
          <button class="delete-btn" onclick="confirmDelete('schoolYear')">Delete</button>
        </div>
      </div>

      <script>
        // Utility function to handle API calls
        async function apiCall(endpoint, method = 'GET', body = null) {
          try {
            const response = await fetch(endpoint, {
              method,
              headers: {
                'Content-Type': 'application/json',
              },
              body: body ? JSON.stringify(body) : null
            });
            const data = await response.json();
            return { success: true, data };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }

        // Add toggle function
        function toggleResponse(elementId) {
          const element = document.getElementById(elementId);
          if (element.style.display === 'none' || !element.style.display) {
            element.style.display = 'block';
          } else {
            element.style.display = 'none';
          }
        }

        // Subjects
        async function fetchSubjects() {
          const responseElement = document.getElementById('subjectsResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/subjects');
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        async function addSubject() {
          const subjectName = document.getElementById('subjectName').value;
          const responseElement = document.getElementById('addSubjectResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/subjects', 'POST', { subjectName });
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        // Classes
        async function fetchClasses() {
          const responseElement = document.getElementById('classesResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/classes');
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        async function addClass() {
          const body = {
            grade_level: document.getElementById('gradeLevel').value,
            section: document.getElementById('section').value,
            school_year: document.getElementById('schoolYear').value,
            class_description: document.getElementById('classDescription').value
          };
          const result = await apiCall('/api/classes', 'POST', body);
          document.getElementById('addClassResponse').innerHTML = 
            '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        // Teachers
        async function fetchTeachers() {
          const responseElement = document.getElementById('teachersResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/teachers');
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        async function addTeacher() {
          const body = {
            teacherId: document.getElementById('teacherId').value,
            fname: document.getElementById('fname').value,
            mname: document.getElementById('mname').value,
            lname: document.getElementById('lname').value,
            gender: document.getElementById('gender').value
          };
          const result = await apiCall('/api/teachers', 'POST', body);
          document.getElementById('addTeacherResponse').innerHTML = 
            '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        // Students
        async function fetchStudents() {
          const responseElement = document.getElementById('studentsResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/students');
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        async function addStudent() {
          const body = {
            fname: document.getElementById('studentFname').value,
            mname: document.getElementById('studentMname').value,
            lname: document.getElementById('studentLname').value,
            gender: document.getElementById('studentGender').value,
            age: parseInt(document.getElementById('studentAge').value)
          };
          
          const responseElement = document.getElementById('addStudentResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/students', 'POST', body);
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        // School Years
        async function fetchSchoolYears() {
          const responseElement = document.getElementById('schoolYearsResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/school-years');
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        async function addSchoolYear() {
          const body = {
            school_year: document.getElementById('schoolYear').value,
            is_active: false // Default to inactive when creating
          };
          
          const responseElement = document.getElementById('addSchoolYearResponse');
          responseElement.style.display = 'block';
          const result = await apiCall('/api/school-years', 'POST', body);
          responseElement.innerHTML = '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
        }

        // Confirmation dialog for adding records
        async function confirmAdd(type, callback) {
          if (confirm('Are you sure you want to add this ' + type + '?')) {
            await callback();
          }
        }

        // Confirmation dialog for deleting records
        async function confirmDelete(type, id) {
          if (confirm('Are you sure you want to delete this ' + type + '?')) {
            try {
              const response = await fetch('/api/' + type + 's/' + id, {
                method: 'DELETE',
              });
              const result = await response.json();
              alert(result.message);
              // Refresh the list after deletion
              window['fetch' + type.charAt(0).toUpperCase() + type.slice(1) + 's']();
            } catch (error) {
              console.error('Error:', error);
              alert('Failed to delete ' + type);
            }
          }
        }

        // Update the add functions to use confirmation
        async function addSubject() {
          confirmAdd('subject', async () => {
            const subjectName = document.getElementById('subjectName').value;
            const result = await apiCall('/api/subjects', 'POST', { subjectName });
            document.getElementById('addSubjectResponse').innerHTML = 
              '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
            fetchSubjects();
          });
        }

        async function addClass() {
          confirmAdd('class', async () => {
            const body = {
              grade_level: document.getElementById('gradeLevel').value,
              section: document.getElementById('section').value,
              school_year: document.getElementById('schoolYear').value,
              class_description: document.getElementById('classDescription').value
            };
            const result = await apiCall('/api/classes', 'POST', body);
            document.getElementById('addClassResponse').innerHTML = 
              '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
            fetchClasses();
          });
        }

        async function addTeacher() {
          confirmAdd('teacher', async () => {
            const body = {
              teacherId: document.getElementById('teacherId').value,
              fname: document.getElementById('fname').value,
              mname: document.getElementById('mname').value,
              lname: document.getElementById('lname').value,
              gender: document.getElementById('gender').value
            };
            const result = await apiCall('/api/teachers', 'POST', body);
            document.getElementById('addTeacherResponse').innerHTML = 
              '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
            fetchTeachers();
          });
        }

        async function addStudent() {
          confirmAdd('student', async () => {
            const body = {
              fname: document.getElementById('studentFname').value,
              mname: document.getElementById('studentMname').value,
              lname: document.getElementById('studentLname').value,
              gender: document.getElementById('studentGender').value,
              age: parseInt(document.getElementById('studentAge').value)
            };
            const result = await apiCall('/api/students', 'POST', body);
            document.getElementById('addStudentResponse').innerHTML = 
              '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>';
            fetchStudents();
          });
        }

        // Delete functionality
        function showDeleteDialog(dialogId) {
          document.getElementById('overlay').style.display = 'block';
          document.getElementById(dialogId).style.display = 'block';
        }

        function closeDeleteDialog(dialogId) {
          document.getElementById('overlay').style.display = 'none';
          document.getElementById(dialogId).style.display = 'none';
        }

        function updateIdField(type) {
          const select = document.getElementById(type + 'Select');
          const idField = document.getElementById(type + 'Id');
          idField.value = select.value;
        }

        async function deleteSubject() {
          const subjects = await apiCall('/api/subjects');
          const select = document.getElementById('subjectSelect');
          select.innerHTML = '<option value="">Select a subject...</option>' +
            subjects.data.map(subject => (
              '<option value="' + subject.subject_id + '">' + 
              subject.subject_name + ' (ID: ' + subject.subject_id + ')</option>'
            )).join('');
          showDeleteDialog('deleteSubjectDialog');
        }

        async function deleteClass() {
          const classes = await apiCall('/api/classes');
          const select = document.getElementById('classSelect');
          select.innerHTML = '<option value="">Select a class...</option>' +
            classes.data.map(cls => (
              '<option value="' + cls.class_id + '">Grade ' + 
              cls.grade_level + '-' + cls.section + ' (' + cls.school_year + 
              ') (ID: ' + cls.class_id + ')</option>'
            )).join('');
          showDeleteDialog('deleteClassDialog');
        }

        async function deleteTeacher() {
          const teachers = await apiCall('/api/teachers');
          const select = document.getElementById('teacherSelect');
          select.innerHTML = '<option value="">Select a teacher...</option>' +
            teachers.data.map(teacher => (
              '<option value="' + teacher.teacher_id + '">' + 
              teacher.fname + ' ' + teacher.lname + ' (ID: ' + teacher.teacher_id + ')</option>'
            )).join('');
          showDeleteDialog('deleteTeacherDialog');
        }

        async function deleteStudent() {
          const students = await apiCall('/api/students');
          const select = document.getElementById('studentSelect');
          select.innerHTML = '<option value="">Select a student...</option>' +
            students.data.map(student => (
              '<option value="' + student.student_id + '">' + 
              student.fname + ' ' + student.lname + ' (ID: ' + student.student_id + ')</option>'
            )).join('');
          showDeleteDialog('deleteStudentDialog');
        }

        async function confirmDelete(type) {
          const idField = document.getElementById(type + 'Id');
          const select = document.getElementById(type + 'Select');
          const id = idField.value || select.value;
          
          if (!id) {
            alert('Please select an item or enter an ID to delete');
            return;
          }

          if (confirm('Are you sure you want to delete ' + type + ' with ID: ' + id + '?')) {
            try {
              const response = await fetch('/api/' + type + 's/' + id, {
                method: 'DELETE'
              });
              const result = await response.json();
              
              if (response.ok) {
                alert(result.message || type + ' with ID ' + id + ' deleted successfully');
                closeDeleteDialog('delete' + type.charAt(0).toUpperCase() + type.slice(1) + 'Dialog');
                // Refresh the list
                window['fetch' + type.charAt(0).toUpperCase() + type.slice(1) + 's']();
              } else {
                throw new Error(result.error || 'Failed to delete ' + type + ' with ID ' + id);
              }
            } catch (error) {
              alert(error.message);
            }
          }
        }

        // Add edit button to each section's button group
        document.querySelectorAll('.button-group').forEach(group => {
          const deleteBtn = group.querySelector('.delete-btn');
          if (deleteBtn) {
            const type = deleteBtn.getAttribute('onclick').match(/delete(\w+)\(\)/)[1].toLowerCase();
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.textContent = 'Edit';
            editBtn.onclick = () => showEditDialog(type);
            group.insertBefore(editBtn, deleteBtn);
          }
        });

        // Edit functionality
        function showEditDialog(type) {
          document.getElementById('overlay').style.display = 'block';
          document.getElementById('edit' + type.charAt(0).toUpperCase() + type.slice(1) + 'Dialog').style.display = 'block';
          loadEditData(type);
        }

        function closeEditDialog(dialogId) {
          document.getElementById('overlay').style.display = 'none';
          document.getElementById(dialogId).style.display = 'none';
        }

        async function loadEditData(type) {
          const data = await apiCall('/api/' + type + 's');
          const select = document.getElementById('edit' + type.charAt(0).toUpperCase() + type.slice(1) + 'Select');
          
          select.innerHTML = '<option value="">Select a ' + type + '...</option>';
          
          switch(type) {
            case 'subject':
              data.data.forEach(item => {
                select.innerHTML += '<option value="' + item.subject_id + '">' + item.subject_name + '</option>';
              });
              break;
            case 'class':
              data.data.forEach(item => {
                select.innerHTML += '<option value="' + item.class_id + '">Grade ' + item.grade_level + '-' + item.section + ' (' + item.school_year + ')</option>';
              });
              break;
            case 'teacher':
              data.data.forEach(item => {
                select.innerHTML += '<option value="' + item.teacher_id + '">' + item.fname + ' ' + item.lname + '</option>';
              });
              break;
            case 'student':
              data.data.forEach(item => {
                select.innerHTML += '<option value="' + item.student_id + '">' + item.fname + ' ' + item.lname + '</option>';
              });
              break;
          }
        }

        async function loadSubjectData() {
          try {
            const select = document.getElementById('editSubjectSelect');
            if (!select.value) return;
            
            const response = await fetch('/api/subjects/' + select.value);
            if (!response.ok) {
              throw new Error('Failed to load subject data');
            }
            
            const data = await response.json();
            if (!data) {
              throw new Error('No data received');
            }
            
            document.getElementById('editSubjectName').value = data.subject_name || '';
          } catch (error) {
            console.error('Error loading subject:', error);
            // Don't show alert, just log to console
          }
        }

        async function loadClassData() {
          try {
            const select = document.getElementById('editClassSelect');
            if (!select.value) {
              // Clear form fields when no class is selected
              document.getElementById('editGradeLevel').value = '';
              document.getElementById('editSection').value = '';
              document.getElementById('editClassSchoolYear').value = '';
              document.getElementById('editClassDescription').value = '';
              return;
            }
            
            const response = await fetch('/api/classes/' + select.value);
            if (!response.ok) {
              throw new Error('Failed to load class data');
            }
            
            const data = await response.json();
            if (!data) {
              throw new Error('No data received');
            }
            
            // Set form field values, using empty string as fallback
            document.getElementById('editGradeLevel').value = data.grade_level || '';
            document.getElementById('editSection').value = data.section || '';
            document.getElementById('editClassSchoolYear').value = data.school_year || '';
            document.getElementById('editClassDescription').value = data.class_description || '';
          } catch (error) {
            console.error('Error loading class:', error);
            alert('Error loading class data: ' + error.message);
          }
        }

        async function loadTeacherData() {
          try {
            const select = document.getElementById('editTeacherSelect');
            if (!select.value) return;
            
            const response = await fetch('/api/teachers/' + select.value);
            if (!response.ok) return;
            
            const data = await response.json();
            if (!data) return;
            
            document.getElementById('editTeacherFname').value = data.fname || '';
            document.getElementById('editTeacherMname').value = data.mname || '';
            document.getElementById('editTeacherLname').value = data.lname || '';
            document.getElementById('editTeacherGender').value = data.gender || '';
          } catch (error) {
            console.error('Error loading teacher:', error);
          }
        }

        async function loadStudentData() {
          try {
            const select = document.getElementById('editStudentSelect');
            if (!select.value) return;
            
            const response = await fetch('/api/students/' + select.value);
            if (!response.ok) return;
            
            const data = await response.json();
            if (!data) return;
            
            document.getElementById('editStudentFname').value = data.fname || '';
            document.getElementById('editStudentMname').value = data.mname || '';
            document.getElementById('editStudentLname').value = data.lname || '';
            document.getElementById('editStudentGender').value = data.gender || '';
            document.getElementById('editStudentAge').value = data.age || '';
          } catch (error) {
            console.error('Error loading student:', error);
          }
        }

        async function confirmEdit(type) {
          const select = document.getElementById('edit' + type.charAt(0).toUpperCase() + type.slice(1) + 'Select');
          if (!select.value) {
            alert('Please select an item to edit');
            return;
          }

          let data = {};
          switch(type) {
            case 'subject':
              data = {
                subject_name: document.getElementById('editSubjectName').value
              };
              break;
            case 'class':
              const gradeLevel = document.getElementById('editGradeLevel').value;
              const section = document.getElementById('editSection').value;
              const schoolYear = document.getElementById('editClassSchoolYear').value;
              const description = document.getElementById('editClassDescription').value;
              
              // Validate required fields
              if (!gradeLevel || !section || !schoolYear) {
                alert('Grade Level, Section, and School Year are required');
                return;
              }
              
              data = {
                grade_level: gradeLevel,
                section: section,
                school_year: schoolYear,
                class_description: description || null  // Make description optional
              };
              break;
            case 'teacher':
              data = {
                fname: document.getElementById('editTeacherFname').value,
                mname: document.getElementById('editTeacherMname').value,
                lname: document.getElementById('editTeacherLname').value,
                gender: document.getElementById('editTeacherGender').value
              };
              break;
            case 'student':
              data = {
                fname: document.getElementById('editStudentFname').value,
                mname: document.getElementById('editStudentMname').value,
                lname: document.getElementById('editStudentLname').value,
                gender: document.getElementById('editStudentGender').value,
                age: parseInt(document.getElementById('editStudentAge').value)
              };
              break;
            case 'schoolYear':
              data = {
                school_year: document.getElementById('editSchoolYearInput').value,
                is_active: document.getElementById('editSchoolYearStatus').value === 'true'
              };
              break;
          }

          try {
            const response = await fetch('/api/' + type + 's/' + select.value, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to update ' + type);
            }

            const result = await response.json();
            alert(type.charAt(0).toUpperCase() + type.slice(1) + ' updated successfully');
            closeEditDialog('edit' + type.charAt(0).toUpperCase() + type.slice(1) + 'Dialog');
            // Refresh the list
            window['fetch' + type.charAt(0).toUpperCase() + type.slice(1) + 's']();
          } catch (error) {
            console.error('Update error:', error);
            alert(error.message);
          }
        }

        // Add loadSchoolYearData function
        async function loadSchoolYearData() {
          try {
            const select = document.getElementById('editSchoolYearSelect');
            if (!select.value) return;
            
            const response = await fetch('/api/school-years/' + select.value);
            if (!response.ok) return;
            
            const data = await response.json();
            if (!data) return;
            
            document.getElementById('editSchoolYearInput').value = data.school_year || '';
            document.getElementById('editSchoolYearStatus').value = data.is_active.toString();
          } catch (error) {
            console.error('Error loading school year:', error);
          }
        }

        // Add deleteSchoolYear function
        async function deleteSchoolYear() {
          const schoolYears = await apiCall('/api/school-years');
          const select = document.getElementById('schoolYearSelect');
          select.innerHTML = '<option value="">Select a school year...</option>' +
            schoolYears.data.map(year => (
              '<option value="' + year.school_year_id + '">' + 
              year.school_year + ' (' + (year.is_active ? 'Active' : 'Inactive') + ')</option>'
            )).join('');
          showDeleteDialog('deleteSchoolYearDialog');
        }
      </script>
      <!-- Add delete dialogs -->
      <div id="overlay" class="overlay"></div>
      
      <div id="deleteSubjectDialog" class="delete-dialog">
        <h3>Delete Subject</h3>
        <div class="delete-form">
          <div class="form-group">
            <label>Select Subject:</label>
            <select id="subjectSelect" onchange="updateIdField('subject')"></select>
          </div>
          <div class="form-group">
            <label>Or Enter Subject ID:</label>
            <input type="text" id="subjectId" placeholder="Enter Subject ID">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeDeleteDialog('deleteSubjectDialog')">Cancel</button>
          <button class="delete-btn" onclick="confirmDelete('subject')">Delete</button>
        </div>
      </div>

      <div id="deleteClassDialog" class="delete-dialog">
        <h3>Delete Class</h3>
        <div class="delete-form">
          <div class="form-group">
            <label>Select Class:</label>
            <select id="classSelect" onchange="updateIdField('class')"></select>
          </div>
          <div class="form-group">
            <label>Or Enter Class ID:</label>
            <input type="text" id="classId" placeholder="Enter Class ID">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeDeleteDialog('deleteClassDialog')">Cancel</button>
          <button class="delete-btn" onclick="confirmDelete('class')">Delete</button>
        </div>
      </div>

      <div id="deleteTeacherDialog" class="delete-dialog">
        <h3>Delete Teacher</h3>
        <div class="delete-form">
          <div class="form-group">
            <label>Select Teacher:</label>
            <select id="teacherSelect" onchange="updateIdField('teacher')"></select>
          </div>
          <div class="form-group">
            <label>Or Enter Teacher ID:</label>
            <input type="text" id="teacherId" placeholder="Enter Teacher ID">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeDeleteDialog('deleteTeacherDialog')">Cancel</button>
          <button class="delete-btn" onclick="confirmDelete('teacher')">Delete</button>
        </div>
      </div>

      <div id="deleteStudentDialog" class="delete-dialog">
        <h3>Delete Student</h3>
        <div class="delete-form">
          <div class="form-group">
            <label>Select Student:</label>
            <select id="studentSelect" onchange="updateIdField('student')"></select>
          </div>
          <div class="form-group">
            <label>Or Enter Student ID:</label>
            <input type="text" id="studentId" placeholder="Enter Student ID">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeDeleteDialog('deleteStudentDialog')">Cancel</button>
          <button class="delete-btn" onclick="confirmDelete('student')">Delete</button>
        </div>
      </div>

      <!-- Add edit dialogs -->
      <div id="editSubjectDialog" class="edit-dialog">
        <h3>Edit Subject</h3>
        <div class="edit-form">
          <div class="form-group">
            <label>Select Subject:</label>
            <select id="editSubjectSelect" onchange="loadSubjectData()"></select>
          </div>
          <div class="form-group">
            <label>Subject Name:</label>
            <input type="text" id="editSubjectName">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeEditDialog('editSubjectDialog')">Cancel</button>
          <button class="edit-btn" onclick="confirmEdit('subject')">Save Changes</button>
        </div>
      </div>

      <div id="editClassDialog" class="edit-dialog">
        <h3>Edit Class</h3>
        <div class="edit-form">
          <div class="form-group">
            <label>Select Class:</label>
            <select id="editClassSelect" onchange="loadClassData()" required>
              <option value="">Select a class...</option>
            </select>
          </div>
          <div class="form-group">
            <label>Grade Level:</label>
            <input type="text" id="editGradeLevel" required pattern="[0-9]+" title="Please enter a valid grade level (numbers only)">
          </div>
          <div class="form-group">
            <label>Section:</label>
            <input type="text" id="editSection" required pattern="[A-Za-z0-9-]+" title="Please enter a valid section (letters, numbers, and hyphens only)">
          </div>
          <div class="form-group">
            <label>School Year:</label>
            <input type="text" id="editClassSchoolYear" required pattern="\d{4}-\d{4}" title="Please enter a valid school year (e.g., 2023-2024)">
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea id="editClassDescription" rows="3" placeholder="Optional class description"></textarea>
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeEditDialog('editClassDialog')">Cancel</button>
          <button class="edit-btn" onclick="confirmEdit('class')">Save Changes</button>
        </div>
      </div>

      <div id="editTeacherDialog" class="edit-dialog">
        <h3>Edit Teacher</h3>
        <div class="edit-form">
          <div class="form-group">
            <label>Select Teacher:</label>
            <select id="editTeacherSelect" onchange="loadTeacherData()"></select>
          </div>
          <div class="form-group">
            <label>First Name:</label>
            <input type="text" id="editTeacherFname">
          </div>
          <div class="form-group">
            <label>Middle Name:</label>
            <input type="text" id="editTeacherMname">
          </div>
          <div class="form-group">
            <label>Last Name:</label>
            <input type="text" id="editTeacherLname">
          </div>
          <div class="form-group">
            <label>Gender:</label>
            <input type="text" id="editTeacherGender">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeEditDialog('editTeacherDialog')">Cancel</button>
          <button class="edit-btn" onclick="confirmEdit('teacher')">Save Changes</button>
        </div>
      </div>

      <div id="editStudentDialog" class="edit-dialog">
        <h3>Edit Student</h3>
        <div class="edit-form">
          <div class="form-group">
            <label>Select Student:</label>
            <select id="editStudentSelect" onchange="loadStudentData()"></select>
          </div>
          <div class="form-group">
            <label>First Name:</label>
            <input type="text" id="editStudentFname">
          </div>
          <div class="form-group">
            <label>Middle Name:</label>
            <input type="text" id="editStudentMname">
          </div>
          <div class="form-group">
            <label>Last Name:</label>
            <input type="text" id="editStudentLname">
          </div>
          <div class="form-group">
            <label>Gender:</label>
            <input type="text" id="editStudentGender">
          </div>
          <div class="form-group">
            <label>Age:</label>
            <input type="number" id="editStudentAge">
          </div>
        </div>
        <div class="button-group">
          <button onclick="closeEditDialog('editStudentDialog')">Cancel</button>
          <button class="edit-btn" onclick="confirmEdit('student')">Save Changes</button>
        </div>
      </div>
    </body>
    </html>
  `);
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 
