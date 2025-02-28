-- Create database if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'school_management') THEN
        CREATE DATABASE school_management;
    END IF;
END $$;

-- Connect to the database
\c school_management;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('admin', 'teacher', 'student')),
    flag BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS teacher (
    teacher_id VARCHAR(20) PRIMARY KEY,
    fname VARCHAR(50) NOT NULL,
    mname VARCHAR(50),
    lname VARCHAR(50) NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female')),
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS student (
    student_id SERIAL PRIMARY KEY,
    fname VARCHAR(50) NOT NULL,
    mname VARCHAR(50),
    lname VARCHAR(50) NOT NULL,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female')),
    age INTEGER,
    user_id INTEGER REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS subject (
    subject_id SERIAL PRIMARY KEY,
    subject_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS school_year (
    school_year_id SERIAL PRIMARY KEY,
    school_year VARCHAR(20) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS class (
    class_id SERIAL PRIMARY KEY,
    grade_level VARCHAR(20) NOT NULL,
    section VARCHAR(20) NOT NULL,
    school_year VARCHAR(20) REFERENCES school_year(school_year),
    class_description TEXT
);

CREATE TABLE IF NOT EXISTS class_subject (
    class_id INTEGER REFERENCES class(class_id),
    subject_id INTEGER REFERENCES subject(subject_id),
    teacher_id VARCHAR(20) REFERENCES teacher(teacher_id),
    school_year_id INTEGER REFERENCES school_year(school_year_id),
    PRIMARY KEY (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS class_student (
    class_id INTEGER REFERENCES class(class_id),
    student_id INTEGER REFERENCES student(student_id),
    PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS student_grade (
    student_id INTEGER REFERENCES student(student_id),
    subject_id INTEGER REFERENCES subject(subject_id),
    class_id INTEGER REFERENCES class(class_id),
    teacher_id VARCHAR(20) REFERENCES teacher(teacher_id),
    quarter INTEGER CHECK (quarter BETWEEN 1 AND 4),
    grade NUMERIC(5,2) CHECK (grade BETWEEN 0 AND 100),
    PRIMARY KEY (student_id, subject_id, class_id, quarter)
);

-- Insert initial data
INSERT INTO users (username, password, user_type) 
VALUES 
    ('admin', 'admin123', 'admin'),
    ('teacher1', 'teacher123', 'teacher'),
    ('student1', 'student123', 'student')
ON CONFLICT (username) DO NOTHING;

INSERT INTO school_year (school_year, is_active) 
VALUES 
    ('2023-2024', true),
    ('2024-2025', false)
ON CONFLICT (school_year) DO NOTHING;

INSERT INTO subject (subject_name) 
VALUES 
    ('Mathematics'),
    ('Science'),
    ('English'),
    ('History'),
    ('Physical Education')
ON CONFLICT (subject_name) DO NOTHING;

INSERT INTO teacher (teacher_id, fname, mname, lname, gender, status) 
VALUES 
    ('T001', 'John', 'M', 'Smith', 'Male', 'ACTIVE'),
    ('T002', 'Mary', 'J', 'Johnson', 'Female', 'ACTIVE'),
    ('T003', 'Robert', 'L', 'Williams', 'Male', 'ACTIVE')
ON CONFLICT (teacher_id) DO NOTHING;

-- Insert sample class
INSERT INTO class (grade_level, section, school_year, class_description) 
VALUES 
    ('Grade 7', 'A', '2023-2024', 'Regular Class'),
    ('Grade 8', 'B', '2023-2024', 'Regular Class')
ON CONFLICT DO NOTHING; 