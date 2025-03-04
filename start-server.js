const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 5174;

// Enable CORS for all origins during development
app.use(cors());
app.use(express.json());

// Database connection configuration that works both locally and on Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/school_db',
  ssl: process.env.DATABASE_URL ? {
    rejectUnauthorized: false
  } : false
});

// Test database connection
pool.connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL database successfully!');
  })
  .catch((err) => {
    console.error('❌ Error connecting to PostgreSQL database:', err);
  });

// Initialize database with grade.sql
const initDatabase = async () => {
  const client = await pool.connect();
  try {
    // Read the SQL file
    const gradeSQL = fs.readFileSync(path.join(__dirname, 'grade.sql'), 'utf8');
    
    // Remove PostgreSQL shell commands and split into statements
    const statements = gradeSQL
      .replace(/\\c.*$/gm, '') // Remove \c commands
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    // Start a transaction
    await client.query('BEGIN');
    
    console.log('Starting database initialization...');
    
    for (let statement of statements) {
      try {
        // Skip CREATE DATABASE statement as we're already connected to the database
        if (statement.toLowerCase().includes('create database')) {
          console.log('Skipping database creation - already exists');
          continue;
        }

        await client.query(statement);
        console.log('Successfully executed:', statement.substring(0, 50) + '...');
      } catch (err) {
        // Handle specific error cases
        switch (err.code) {
          case '42P07': // Table already exists
            console.log(`Table already exists, continuing...`);
            break;
          case '23505': // Unique violation
            console.log(`Skipping duplicate record: ${err.detail}`);
            break;
          case '42703': // Undefined column
            console.error(`Column error: ${err.message}`);
            break;
          case '42P01': // Undefined table
            console.error(`Table error: ${err.message}`);
            break;
          case '23503': // Foreign key violation
            console.error(`Foreign key error: ${err.detail}`);
            break;
          default:
            console.error(`Error (${err.code}): ${err.message}`);
            // Only throw for unexpected errors
            throw err;
        }
      }
    }

    // Commit the transaction
    await client.query('COMMIT');
    console.log('✅ Database initialization completed successfully!');
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('❌ Error during database initialization:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Call this before starting your server
initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

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
        t.status,
        COUNT(cs.class_subject_id) as assigned_classes
      FROM teacher t
      LEFT JOIN class_subject cs ON t.teacher_id = cs.teacher_id
      GROUP BY t.teacher_id, t.fname, t.mname, t.lname, t.gender, t.status
      ORDER BY t.lname, t.fname
    `;
    
    const result = await pool.query(query);
    console.log('Teachers fetched:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET endpoint to fetch a specific teacher
app.get('/api/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        t.teacher_id,
        t.fname,
        t.mname,
        t.lname,
        t.gender,
        t.status
      FROM teacher t
      WHERE t.teacher_id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to add a new teacher
app.post('/api/teachers', async (req, res) => {
  try {
    const { teacherId, fname, mname, lname, gender, status = 'ACTIVE' } = req.body;
    
    // Validate required fields
    if (!fname || !lname || !gender) {
      return res.status(400).json({ error: 'First name, last name, and gender are required' });
    }
    
    // Generate teacher_id if not provided
    let finalTeacherId = teacherId;
    if (!finalTeacherId) {
      // Get the highest existing teacher_id
      const maxIdResult = await pool.query('SELECT MAX(CAST(teacher_id AS INTEGER)) as max_id FROM teacher');
      const maxId = maxIdResult.rows[0].max_id || 0;
      finalTeacherId = (parseInt(maxId) + 1).toString();  
    }
    
    console.log('Adding teacher with ID:', finalTeacherId);
    
    const result = await pool.query(
      'INSERT INTO teacher (teacher_id, fname, mname, lname, gender, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [finalTeacherId, fname, mname, lname, gender, status]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding teacher:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET endpoint to fetch teacher assignments
app.get('/api/teachers/:teacherId/assignments', async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const query = `
      SELECT 
        cs.class_subject_id,
        c.class_id,
        c.grade_level,
        c.section,
        c.school_year,
        s.subject_id,
        s.subject_name
      FROM class_subject cs
      JOIN class c ON cs.class_id = c.class_id
      JOIN subject s ON cs.subject_id = s.subject_id
      WHERE cs.teacher_id = $1
      ORDER BY c.school_year DESC, c.grade_level, c.section, s.subject_name
    `;
    
    const result = await pool.query(query, [teacherId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teacher assignments:', error);
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
    console.log('Fetching all students from database...');
    
    // First check if we can connect to the database
    const testConnection = await pool.query('SELECT NOW()');
    console.log('Database connection test successful:', testConnection.rows[0].now);
    
    // Then check if the student table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'student'
      )`
    );
    
    if (!tableCheck.rows[0].exists) {
      console.error('Student table does not exist in the public schema');
      return res.status(500).json({ 
        error: 'Database table not found',
        details: 'The student table does not exist in the public schema' 
      });
    }

    console.log('Student table exists, fetching data...');
    
    const result = await pool.query(`
      SELECT 
        student_id,
        fname,
        mname,
        lname,
        gender,
        age
      FROM student 
      ORDER BY lname, fname
    `);
    
    console.log(`Found ${result.rows.length} students`);
    
    if (!result.rows || !Array.isArray(result.rows)) {
      console.error('Invalid data format from database:', result.rows);
      return res.status(500).json({
        error: 'Invalid data format',
        details: 'Database returned unexpected data format'
      });
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Detailed error in /api/students:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      code: error.code
    });
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

// Grade Management Endpoints

// Get all grades for a specific student
app.get('/api/grades/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const result = await pool.query(`
      SELECT 
        g.grade_id,
        g.student_id,
        g.subject_id,
        g.quarter,
        g.grade,
        g.school_year,
        s.subject_name,
        t.fname || ' ' || t.lname as teacher_name
      FROM grade g
      JOIN subject s ON g.subject_id = s.subject_id
      LEFT JOIN teacher t ON g.teacher_id = t.teacher_id
      WHERE g.student_id = $1
      ORDER BY g.school_year DESC, s.subject_name, g.quarter
    `, [studentId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching student grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new grade
app.post('/api/grades', async (req, res) => {
  try {
    const { 
      student_id, 
      subject_id, 
      teacher_id,
      quarter, 
      grade,
      school_year 
    } = req.body;

    // Validate required fields
    if (!student_id || !subject_id || !quarter || !grade || !school_year) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    // Validate grade range (0-100)
    if (grade < 0 || grade > 100) {
      return res.status(400).json({ 
        error: 'Grade must be between 0 and 100' 
      });
    }

    // Validate quarter (1-4)
    if (quarter < 1 || quarter > 4) {
      return res.status(400).json({ 
        error: 'Quarter must be between 1 and 4' 
      });
    }

    const result = await pool.query(`
      INSERT INTO grade (
        student_id, 
        subject_id, 
        teacher_id,
        quarter, 
        grade, 
        school_year
      ) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [student_id, subject_id, teacher_id, quarter, grade, school_year]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding grade:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a grade
app.put('/api/grades/:gradeId', async (req, res) => {
  try {
    const { gradeId } = req.params;
    const { grade } = req.body;

    // Validate grade range
    if (grade < 0 || grade > 100) {
      return res.status(400).json({ 
        error: 'Grade must be between 0 and 100' 
      });
    }

    const result = await pool.query(`
      UPDATE grade 
      SET grade = $1 
      WHERE grade_id = $2 
      RETURNING *
    `, [grade, gradeId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating grade:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a grade
app.delete('/api/grades/:gradeId', async (req, res) => {
  try {
    const { gradeId } = req.params;
    const result = await pool.query(
      'DELETE FROM grade WHERE grade_id = $1 RETURNING *',
      [gradeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    res.json({ message: 'Grade deleted successfully' });
  } catch (error) {
    console.error('Error deleting grade:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get class grades (for a specific class and subject)
app.get('/api/grades/class/:classId/subject/:subjectId', async (req, res) => {
  try {
    const { classId, subjectId } = req.params;
    const result = await pool.query(`
      SELECT 
        s.student_id,
        s.fname || ' ' || s.lname as student_name,
        g.quarter,
        g.grade
      FROM student s
      JOIN class_student cs ON s.student_id = cs.student_id
      LEFT JOIN grade g ON s.student_id = g.student_id 
        AND g.subject_id = $2
      WHERE cs.class_id = $1
      ORDER BY s.lname, s.fname, g.quarter
    `, [classId, subjectId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get teacher's given grades
app.get('/api/grades/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const result = await pool.query(`
      SELECT 
        g.grade_id,
        s.fname || ' ' || s.lname as student_name,
        sub.subject_name,
        g.quarter,
        g.grade,
        g.school_year
      FROM grade g
      JOIN student s ON g.student_id = s.student_id
      JOIN subject sub ON g.subject_id = sub.subject_id
      WHERE g.teacher_id = $1
      ORDER BY g.school_year DESC, sub.subject_name, s.lname, g.quarter
    `, [teacherId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teacher grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grade statistics for a class
app.get('/api/grades/stats/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const result = await pool.query(`
      WITH grade_stats AS (
        SELECT 
          s.subject_name,
          COUNT(g.grade) as total_grades,
          ROUND(AVG(g.grade)::numeric, 2) as average_grade,
          MIN(g.grade) as lowest_grade,
          MAX(g.grade) as highest_grade
        FROM class_subject cs
        JOIN subject s ON cs.subject_id = s.subject_id
        LEFT JOIN grade g ON s.subject_id = g.subject_id
        WHERE cs.class_id = $1
        GROUP BY s.subject_name
      )
      SELECT 
        subject_name,
        total_grades,
        average_grade,
        lowest_grade,
        highest_grade
      FROM grade_stats
      ORDER BY subject_name
    `, [classId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching grade statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add students page route
app.get('/students', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Students - School Management Database</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        body {
          background: #f5f5f5;
        }

        .nav {
          background: #3b82f6;
          color: white;
          padding: 1rem;
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .nav-brand {
          font-weight: bold;
          font-size: 1.1rem;
          color: white;
          text-decoration: none;
        }

        .nav-links {
          display: flex;
          gap: 1.5rem;
        }

        .nav-link {
          color: white;
          text-decoration: none;
          font-size: 0.9rem;
        }

        .container {
          max-width: 1200px;
          margin: 2rem auto;
          padding: 0 1rem;
        }

        .page-title {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
          color: #1f2937;
        }

        .students-table {
          width: 100%;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border-collapse: collapse;
          margin-bottom: 2rem;
        }

        .students-table th,
        .students-table td {
          padding: 1rem;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }

        .students-table th {
          background: #f8fafc;
          font-weight: 600;
          color: #4b5563;
        }

        .students-table tr:last-child td {
          border-bottom: none;
        }

        .students-table tbody tr:hover {
          background: #f8fafc;
        }
      </style>
    </head>
    <body>
      <nav class="nav">
        <a href="/" class="nav-brand">School Management Database</a>
        <div class="nav-links">
          <a href="/dashboard" class="nav-link">Dashboard</a>
          <a href="/students" class="nav-link">Students</a>
          <a href="/teachers" class="nav-link">Teachers</a>
          <a href="/classes" class="nav-link">Classes</a>
          <a href="/subjects" class="nav-link">Subjects</a>
          <a href="/student-grade" class="nav-link">Student Grade</a>
          <a href="/class-subject" class="nav-link">Class Subject</a>
          <a href="/class-student" class="nav-link">Class Student</a>
          <a href="/school-year" class="nav-link">School Year</a>
          <a href="/users" class="nav-link">Users</a>
        </div>
      </nav>

      <div class="container">
        <h1 class="page-title">Students</h1>
        
        <table class="students-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>First Name</th>
              <th>Middle Name</th>
              <th>Last Name</th>
              <th>Gender</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody id="studentsTableBody">
            <!-- Data will be populated here -->
          </tbody>
        </table>
      </div>

      <script>
        // Fetch and display students data
        async function fetchStudents() {
          try {
            const response = await fetch('/api/students');
            if (!response.ok) {
              throw new Error('HTTP error! status: ' + response.status);
            }
            const students = await response.json();
            
            if (!Array.isArray(students)) {
              console.error('Expected array of students but got:', students);
              throw new Error('Invalid data format received from server');
            }
            
            const tableBody = document.getElementById('studentsTableBody');
            tableBody.innerHTML = students.map(student => 
              '<tr>' +
                '<td>' + (student.student_id || 'N/A') + '</td>' +
                '<td>' + (student.fname || 'N/A') + '</td>' +
                '<td>' + (student.mname || '-') + '</td>' +
                '<td>' + (student.lname || 'N/A') + '</td>' +
                '<td>' + (student.gender || 'N/A') + '</td>' +
                '<td>' + (student.age || 'N/A') + '</td>' +
              '</tr>'
            ).join('');
          } catch (error) {
            console.error('Error fetching students:', error);
            document.getElementById('studentsTableBody').innerHTML = 
              '<tr><td colspan="6" style="text-align: center; color: #dc2626;">Failed to load students data. Please try again later.</td></tr>';
          }
        }

        // Load students when the page loads
        window.addEventListener('load', fetchStudents);
      </script>
    </body>
    </html>
  `);
});

// Root route - Dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Dashboard route
app.get('/dashboard', async (req, res) => {
  try {
    // Get actual counts from database
    const studentCount = await pool.query('SELECT COUNT(*) FROM student');
    const teacherCount = await pool.query('SELECT COUNT(*) FROM teacher');
    const classCount = await pool.query('SELECT COUNT(*) FROM class');
    const subjectCount = await pool.query('SELECT COUNT(*) FROM subject');

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>School Management Database</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        body {
          background: #f5f5f5;
        }

        .nav {
          background: #3b82f6;
          color: white;
          padding: 1rem;
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .nav-brand {
          font-weight: bold;
          font-size: 1.1rem;
          color: white;
          text-decoration: none;
        }

        .nav-links {
          display: flex;
          gap: 1.5rem;
        }

        .nav-link {
          color: white;
          text-decoration: none;
          font-size: 0.9rem;
        }

        .container {
          max-width: 1200px;
          margin: 2rem auto;
          padding: 0 1rem;
        }

        .dashboard-title {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
          color: #1f2937;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .stat-card.students { background: #3b82f6; color: white; }
        .stat-card.teachers { background: #10b981; color: white; }
        .stat-card.classes { background: #06b6d4; color: white; }
        .stat-card.subjects { background: #fbbf24; color: white; }

        .stat-number {
          font-size: 2rem;
          font-weight: bold;
          margin-bottom: 0.5rem;
        }

        .stat-label {
          font-size: 0.9rem;
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <nav class="nav">
        <a href="/" class="nav-brand">School Management Database</a>
        <div class="nav-links">
          <a href="/dashboard" class="nav-link">Dashboard</a>
          <a href="/students" class="nav-link">Students</a>
          <a href="/teachers" class="nav-link">Teachers</a>
          <a href="/classes" class="nav-link">Classes</a>
          <a href="/subjects" class="nav-link">Subjects</a>
          <a href="/student-grade" class="nav-link">Student Grade</a>
          <a href="/class-subject" class="nav-link">Class Subject</a>
          <a href="/class-student" class="nav-link">Class Student</a>
          <a href="/school-year" class="nav-link">School Year</a>
          <a href="/users" class="nav-link">Users</a>
        </div>
      </nav>

      <div class="container">
        <h1 class="dashboard-title">Dashboard</h1>
        
        <div class="stats-grid">
          <div class="stat-card students">
            <div class="stat-number">${studentCount.rows[0].count}</div>
            <div class="stat-label">Students</div>
          </div>
          <div class="stat-card teachers">
            <div class="stat-number">${teacherCount.rows[0].count}</div>
            <div class="stat-label">Teachers</div>
          </div>
          <div class="stat-card classes">
            <div class="stat-number">${classCount.rows[0].count}</div>
            <div class="stat-label">Classes</div>
          </div>
          <div class="stat-card subjects">
            <div class="stat-number">${subjectCount.rows[0].count}</div>
            <div class="stat-label">Subjects</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`); 
}); 
