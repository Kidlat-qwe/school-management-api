const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
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

// Test database connection
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL!"))
  .catch(err => console.error("❌ Database connection error:", err));

module.exports = pool;

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

// Get school years endpoint
app.get('/api/school-years', async (req, res) => {
  try {
    const query = `
      SELECT 
        school_year_id,
        school_year,
        is_active
      FROM school_year
      ORDER BY school_year DESC
    `;
    
    console.log('Fetching school years...'); // Debug log
    const result = await pool.query(query);
    console.log('School years found:', result.rows); // Debug log
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
    console.log('Login attempt for username:', username);

    // Updated query to use correct table name 'teacher' instead of 'teachers'
    const query = `
      SELECT u.user_id, u.username, u.password, u.user_type,
             t.teacher_id, t.fname, t.lname, t.mname
      FROM users u
      LEFT JOIN teacher t ON u.user_id = t.user_id
      WHERE u.username = $1
    `;

    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // For testing purposes, temporarily skip password verification
    // In production, you should properly verify the password
    // const isValidPassword = await bcrypt.compare(password, user.password);
    const isValidPassword = password === user.password; // Temporary direct comparison

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Create token and send response
    const token = jwt.sign(
      { 
        userId: user.user_id,
        teacherId: user.teacher_id,
        userType: user.user_type 
      },
      'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      userType: user.user_type,
      user: {
        id: user.teacher_id || user.user_id, // Use teacher_id if available, otherwise use user_id
        username: user.username,
        fname: user.fname,
        mname: user.mname,
        lname: user.lname
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error occurred' });
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

// Get sections for a specific school year and grade level
app.get('/api/sections/:schoolYear/:gradeLevel', async (req, res) => {
  try {
    const { schoolYear, gradeLevel } = req.params;
    
    const query = `
      SELECT DISTINCT section
      FROM class
      WHERE school_year = $1 AND grade_level = $2
      ORDER BY section
    `;
    
    const result = await pool.query(query, [schoolYear, gradeLevel]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get academic rankings
app.get('/api/academic-rankings', async (req, res) => {
  try {
    const { schoolYear, quarter, gradeLevel, section } = req.query;
    
    let query = `
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
      WHERE c.school_year = $1 
      AND sg.quarter = $2
    `;
    
    const params = [schoolYear, quarter];
    let paramCount = 2;

    if (gradeLevel && gradeLevel !== 'All Grades (Campus-wide)') {
      paramCount++;
      query += ` AND c.grade_level = $${paramCount}`;
      params.push(gradeLevel);

      if (section && section !== 'Select Section') {
        paramCount++;
        query += ` AND c.section = $${paramCount}`;
        params.push(section);
      }
    }

    query += `
      GROUP BY 
        s.student_id,
        s.fname,
        s.lname,
        c.grade_level,
        c.section
      ORDER BY average DESC
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching rankings:', error);
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

// PUT endpoint to update a subject
app.put('/api/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { subjectName } = req.body;
    
    const result = await pool.query(
      'UPDATE subject SET subject_name = $1 WHERE subject_id = $2 RETURNING *',
      [subjectName, id]
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

// Get subjects assigned to a class
app.get('/api/class-subjects/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    
    const result = await pool.query(`
      SELECT DISTINCT s.subject_id, s.subject_name
      FROM subject s
      JOIN class_subject cs ON s.subject_id = cs.subject_id
      WHERE cs.class_id = $1
      ORDER BY s.subject_name
    `, [classId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class subjects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get students for a specific class
app.get('/api/class-students/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    
    const query = `
      SELECT 
        s.student_id,
        s.fname,
        s.lname,
        s.mname,
        cs.class_id,
        COALESCE(
          json_object_agg(
            sub.subject_name,
            sg.grade
          ) FILTER (WHERE sub.subject_name IS NOT NULL),
          '{}'::json
        ) as grades
      FROM student s
      JOIN class_student cs ON s.student_id = cs.student_id
      LEFT JOIN student_grade sg ON s.student_id = sg.student_id 
        AND sg.class_id = cs.class_id
      LEFT JOIN subject sub ON sg.subject_id = sub.subject_id
      WHERE cs.class_id = $1
      GROUP BY 
        s.student_id, 
        s.fname, 
        s.lname, 
        s.mname,
        cs.class_id
      ORDER BY s.lname, s.fname
    `;
    
    const result = await pool.query(query, [classId]);
    console.log('Query result:', result.rows); // Debug log
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class students:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get subjects for a specific class
app.get('/api/class-subjects/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    
    const query = `
      SELECT DISTINCT 
        s.subject_id,
        s.subject_name
      FROM subject s
      JOIN class_subject cs ON s.subject_id = cs.subject_id
      WHERE cs.class_id = $1
      ORDER BY s.subject_name
    `;
    
    const result = await pool.query(query, [classId]);
    
    if (result.rows.length === 0) {
      return res.json([]); // Return empty array if no subjects found
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class subjects:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
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
app.get('/api/student-grades/:userId/:schoolYearId', async (req, res) => {
  try {
    const { userId, schoolYearId } = req.params;
    console.log('Fetching grades for user:', userId, 'school year:', schoolYearId);

    // First get student info and their class
    const studentQuery = `
      SELECT 
        s.student_id, 
        s.fname, 
        s.mname, 
        s.lname,
        c.grade_level, 
        c.section,
        c.class_id
      FROM student s
      JOIN class_student cs ON s.student_id = cs.student_id
      JOIN class c ON cs.class_id = c.class_id
      JOIN school_year sy ON c.school_year = sy.school_year
      WHERE s.user_id = $1 AND sy.school_year_id = $2
    `;

    const studentResult = await pool.query(studentQuery, [userId, schoolYearId]);
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found or not enrolled for this school year' });
    }

    const studentInfo = studentResult.rows[0];

    // Get grades for all subjects
    const gradesQuery = `
      SELECT 
        s.subject_id,
        s.subject_name,
        sg.quarter,
        sg.grade
      FROM class_subject cs
      JOIN subject s ON cs.subject_id = s.subject_id
      LEFT JOIN student_grade sg ON 
        s.subject_id = sg.subject_id AND 
        sg.student_id = $1 AND
        sg.class_id = $2
      WHERE cs.class_id = $2
      ORDER BY s.subject_name, sg.quarter
    `;

    const gradesResult = await pool.query(gradesQuery, [studentInfo.student_id, studentInfo.class_id]);

    // Process grades into the required format
    const gradesMap = new Map();
    gradesResult.rows.forEach(row => {
      if (!gradesMap.has(row.subject_id)) {
        gradesMap.set(row.subject_id, {
          subject_id: row.subject_id,
          subject_name: row.subject_name,
          quarter1: null,
          quarter2: null,
          quarter3: null,
          quarter4: null,
          final_grade: null
        });
      }
      
      if (row.quarter && row.grade !== null) {
        const subject = gradesMap.get(row.subject_id);
        subject[`quarter${row.quarter}`] = parseFloat(row.grade);
        
        // Calculate final grade if all quarters are present
        if (subject.quarter1 !== null && 
            subject.quarter2 !== null && 
            subject.quarter3 !== null && 
            subject.quarter4 !== null) {
          subject.final_grade = ((subject.quarter1 + subject.quarter2 + subject.quarter3 + subject.quarter4) / 4).toFixed(2);
        }
      }
    });

    const grades = Array.from(gradesMap.values());

    // Calculate overall average from final grades
    const finalGrades = grades
      .map(g => g.final_grade)
      .filter(g => g !== null)
      .map(g => parseFloat(g));
    
    const average = finalGrades.length > 0
      ? (finalGrades.reduce((a, b) => a + b, 0) / finalGrades.length).toFixed(2)
      : null;

    // Send response
    res.json({
      ...studentInfo,
      grades,
      average
    });

  } catch (error) {
    console.error('Error fetching student grades:', error);
    res.status(500).json({ 
      error: 'Failed to fetch grades',
      details: error.message
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

// Get classes by school year (string format: "2023-2024")
app.get('/api/classes-by-year/:schoolYear', async (req, res) => {
  try {
    const { schoolYear } = req.params;
    
    const query = `
      SELECT 
        c.class_id,
        c.grade_level,
        c.section,
        c.school_year,
        c.class_description
      FROM class c
      WHERE c.school_year = $1
      ORDER BY 
        CASE 
          WHEN c.grade_level ~ '^[0-9]+$' THEN CAST(c.grade_level AS INTEGER)
          ELSE 999
        END,
        c.section;
    `;
    
    console.log('Fetching classes for school year:', schoolYear);
    const result = await pool.query(query, [schoolYear]);
    console.log('Classes found:', result.rows);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get classes by school year ID (numeric format: 1, 2, etc.)
app.get('/api/classes/:schoolYearId', async (req, res) => {
  try {
    const { schoolYearId } = req.params;
    
    const query = `
      SELECT 
        c.class_id,
        c.grade_level,
        c.section,
        c.school_year,
        COALESCE(c.class_description, 
          CONCAT('Grade ', c.grade_level, ' - Section ', c.section)
        ) as class_description
      FROM class c
      JOIN school_year sy ON c.school_year = sy.school_year
      WHERE sy.school_year_id = $1
      ORDER BY 
        CASE 
          WHEN c.grade_level ~ '^[0-9]+$' THEN CAST(c.grade_level AS INTEGER)
          ELSE 999
        END,
        c.section;
    `;
    
    console.log('Executing query for school year ID:', schoolYearId);
    const result = await pool.query(query, [schoolYearId]);
    console.log('Query result:', result.rows);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fix the Academic Rankings classes endpoint
app.get('/api/academic/classes/:schoolYearId', async (req, res) => {
  try {
    const { schoolYearId } = req.params;
    
    const query = `
      SELECT 
        c.class_id,
        c.grade_level,
        c.section,
        c.school_year,
        CONCAT('Grade ', c.grade_level, ' - Section ', c.section) as class_description,
        CASE 
          WHEN c.grade_level ~ '^[0-9]+$' THEN CAST(c.grade_level AS INTEGER)
          ELSE 999
        END as grade_order
      FROM class c
      JOIN school_year sy ON c.school_year = sy.school_year
      WHERE sy.school_year_id = $1
      ORDER BY grade_order, c.section;
    `;
    
    console.log('Fetching academic classes for year ID:', schoolYearId);
    const result = await pool.query(query, [schoolYearId]);
    
    // Remove the grade_order field from the response
    const formattedResults = result.rows.map(({ grade_order, ...rest }) => rest);
    
    res.json(formattedResults);
  } catch (error) {
    console.error('Error fetching academic classes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint for Student Grades classes
app.get('/api/grades/classes/:schoolYear', async (req, res) => {
  try {
    const { schoolYear } = req.params;
    
    const query = `
      SELECT 
        c.class_id,
        c.grade_level,
        c.section,
        c.school_year,
        c.class_description
      FROM class c
      WHERE c.school_year = $1
      ORDER BY 
        CASE 
          WHEN c.grade_level ~ '^[0-9]+$' THEN CAST(c.grade_level AS INTEGER)
          ELSE 999
        END,
        c.section;
    `;
    
    console.log('Fetching grade classes for year:', schoolYear);
    const result = await pool.query(query, [schoolYear]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching grade classes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Modify the rankings endpoint with better error handling
app.get('/api/academic/rankings', async (req, res) => {
  try {
    const { schoolYear, classId, quarter } = req.query;
    
    if (!schoolYear) {
      return res.status(400).json({ 
        error: 'Missing required parameters' 
      });
    }

    let query;
    const params = [schoolYear];

    if (quarter === 'final') {
      query = `
        SELECT 
          s.student_id,
          s.fname,
          s.mname,
          s.lname,
          c.grade_level,
          c.section,
          ROUND(AVG(CASE WHEN sg.quarter = 1 THEN sg.grade END)::numeric, 2) as q1_average,
          ROUND(AVG(CASE WHEN sg.quarter = 2 THEN sg.grade END)::numeric, 2) as q2_average,
          ROUND(AVG(CASE WHEN sg.quarter = 3 THEN sg.grade END)::numeric, 2) as q3_average,
          ROUND(AVG(CASE WHEN sg.quarter = 4 THEN sg.grade END)::numeric, 2) as q4_average,
          ROUND(AVG(sg.grade)::numeric, 2) as average_grade
        FROM student s
        JOIN class_student cs ON s.student_id = cs.student_id
        JOIN class c ON cs.class_id = c.class_id
        LEFT JOIN student_grade sg ON s.student_id = sg.student_id
        WHERE c.school_year = (
          SELECT school_year FROM school_year WHERE school_year_id = $1
        )
        ${classId && classId !== '0' ? 'AND c.class_id = $2' : ''}
        GROUP BY 
          s.student_id,
          s.fname,
          s.mname,
          s.lname,
          c.grade_level,
          c.section
        ORDER BY 
          average_grade DESC NULLS LAST,
          s.lname,
          s.fname
      `;
    } else {
      query = `
        SELECT 
          s.student_id,
          s.fname,
          s.mname,
          s.lname,
          c.grade_level,
          c.section,
          ROUND(AVG(sg.grade)::numeric, 2) as average_grade
        FROM student s
        JOIN class_student cs ON s.student_id = cs.student_id
        JOIN class c ON cs.class_id = c.class_id
        LEFT JOIN student_grade sg ON s.student_id = sg.student_id
        WHERE sg.quarter = $2
        AND c.school_year = (
          SELECT school_year FROM school_year WHERE school_year_id = $1
        )
        ${classId && classId !== '0' ? 'AND c.class_id = $3' : ''}
        GROUP BY 
          s.student_id,
          s.fname,
          s.mname,
          s.lname,
          c.grade_level,
          c.section
        ORDER BY 
          average_grade DESC NULLS LAST,
          s.lname,
          s.fname
      `;
      params.push(quarter);
    }

    if (classId && classId !== '0') {
      params.push(classId);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error in rankings endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Fix the endpoint to use correct table names
app.get('/api/teacher-classes/:teacherId', async (req, res) => {
    try {
        const { teacherId } = req.params;
        const query = `
            SELECT 
                c.grade_level,
                c.section,
                s.subject_name as subject
            FROM class_subject cs
            JOIN class c ON cs.class_id = c.class_id
            JOIN subject s ON cs.subject_id = s.subject_id
            WHERE cs.teacher_id = $1
        `;
        
        const result = await pool.query(query, [teacherId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching teacher classes:', error);
        res.status(500).json({ error: 'Failed to fetch classes' });
    }
});

// Add this new endpoint to get a single teacher's information
app.get('/api/teachers/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    console.log('Fetching teacher with ID:', teacherId); // Debug log
    
    const query = `
      SELECT teacher_id, fname, mname, lname, gender, status
      FROM teacher
      WHERE teacher_id = $1
    `;
    
    const result = await pool.query(query, [teacherId]);
    console.log('Query result:', result.rows); // Debug log
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get classes for a specific teacher
app.get('/api/teacher-classes/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    console.log('Fetching classes for teacher ID:', teacherId); // Debug log
    
    const query = `
      SELECT 
        c.grade_level,
        c.section,
        s.subject_name as subject
      FROM class_subject cs
      JOIN class c ON cs.class_id = c.class_id
      JOIN subject s ON cs.subject_id = s.subject_id
      WHERE cs.teacher_id = $1
    `;
    
    const result = await pool.query(query, [teacherId]);
    console.log('Classes query result:', result.rows); // Debug log
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teacher classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Get school years
app.get('/api/school-years', async (req, res) => {
  try {
    const query = 'SELECT * FROM school_year ORDER BY school_year DESC';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching school years:', error);
    res.status(500).json({ error: 'Failed to fetch school years' });
  }
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 
