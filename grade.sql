-- Create database if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'school_management') THEN
        CREATE DATABASE school_management;
    END IF;
END $$;

-- Connect to the database
\c school_management;

-- Database schema for School Grading System

-- Create tables
CREATE TABLE student (
    student_id SERIAL PRIMARY KEY,
    fname CHARACTER VARYING(50),
    mname CHARACTER VARYING(50),
    lname CHARACTER VARYING(50),
    gender CHARACTER VARYING(1),
    age INTEGER,
    user_id INTEGER
);

CREATE TABLE school_year (
    school_year_id SERIAL PRIMARY KEY,
    school_year CHARACTER VARYING(10),
    is_active BOOLEAN
);

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username CHARACTER VARYING(50),
    password CHARACTER VARYING(255),
    user_type CHARACTER VARYING(20),
    flag BOOLEAN
);

CREATE TABLE subject (
    subject_id SERIAL PRIMARY KEY,
    subject_name CHARACTER VARYING(50)
);

CREATE TABLE class (
    class_id SERIAL PRIMARY KEY,
    grade_level CHARACTER VARYING(20),
    section CHARACTER VARYING(1),
    class_description CHARACTER VARYING,
    school_year CHARACTER VARYING(10)
);

CREATE TABLE teacher (
    teacher_id SERIAL PRIMARY KEY,
    fname CHARACTER VARYING(50),
    mname CHARACTER VARYING(50),
    lname CHARACTER VARYING(50),
    gender CHARACTER VARYING(1),
    status BOOLEAN,
    user_id INTEGER
);

CREATE TABLE student_grade (
    student_id INTEGER,
    class_id INTEGER,
    subject_id INTEGER,
    teacher_id INTEGER,
    quarter INTEGER,
    grade NUMERIC(5,2),
    PRIMARY KEY (student_id, class_id, subject_id, quarter)
);

CREATE TABLE class_subject (
    class_id INTEGER,
    subject_id INTEGER,
    teacher_id INTEGER,
    PRIMARY KEY (class_id, subject_id)
);

CREATE TABLE class_student (
    class_id INTEGER,
    student_id INTEGER,
    PRIMARY KEY (class_id, student_id)
);

-- Add foreign key constraints
ALTER TABLE student
    ADD CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE teacher
    ADD CONSTRAINT fk_teacher_user FOREIGN KEY (user_id) REFERENCES users(user_id);

ALTER TABLE student_grade
    ADD CONSTRAINT fk_student_grade_student FOREIGN KEY (student_id) REFERENCES student(student_id),
    ADD CONSTRAINT fk_student_grade_class FOREIGN KEY (class_id) REFERENCES class(class_id),
    ADD CONSTRAINT fk_student_grade_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
    ADD CONSTRAINT fk_student_grade_teacher FOREIGN KEY (teacher_id) REFERENCES teacher(teacher_id);

ALTER TABLE class_subject
    ADD CONSTRAINT fk_class_subject_class FOREIGN KEY (class_id) REFERENCES class(class_id),
    ADD CONSTRAINT fk_class_subject_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
    ADD CONSTRAINT fk_class_subject_teacher FOREIGN KEY (teacher_id) REFERENCES teacher(teacher_id);

ALTER TABLE class_student
    ADD CONSTRAINT fk_class_student_class FOREIGN KEY (class_id) REFERENCES class(class_id),
    ADD CONSTRAINT fk_class_student_student FOREIGN KEY (student_id) REFERENCES student(student_id);

-- Add indexes for better performance
CREATE INDEX idx_student_user_id ON student(user_id);
CREATE INDEX idx_teacher_user_id ON teacher(user_id);
CREATE INDEX idx_student_grade_student_id ON student_grade(student_id);
CREATE INDEX idx_student_grade_class_id ON student_grade(class_id);
CREATE INDEX idx_student_grade_subject_id ON student_grade(subject_id);
CREATE INDEX idx_student_grade_teacher_id ON student_grade(teacher_id);
CREATE INDEX idx_class_subject_class_id ON class_subject(class_id);
CREATE INDEX idx_class_subject_subject_id ON class_subject(subject_id);
CREATE INDEX idx_class_subject_teacher_id ON class_subject(teacher_id);
CREATE INDEX idx_class_student_class_id ON class_student(class_id);
CREATE INDEX idx_class_student_student_id ON class_student(student_id);

-- Insert some sample data for testing
INSERT INTO users (username, password, user_type, flag) 
VALUES 
('admin', 'password123', 'admin', true),
('teacher1', 'password123', 'teacher', true),
('student1', 'password123', 'student', true);

INSERT INTO school_year (school_year, is_active) 
VALUES ('2023-2024', true);

INSERT INTO subject (subject_name) 
VALUES 
('Mathematics'),
('Science'),
('English'),
('History');

-- Add more sample data as needed 
