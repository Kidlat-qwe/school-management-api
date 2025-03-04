-- Insert Users
INSERT INTO users (username, password, user_type, flag) VALUES
('admin', 'Admin@123', 'Admin', TRUE),
('teacher1', 'Teach@456', 'Teacher', TRUE),
('student1', 'Stud@789', 'Student', TRUE);

-- Insert School Years
INSERT INTO school_year (school_year, is_active) VALUES
('2023-2024', TRUE),
('2024-2025', FALSE);

-- Insert Students
INSERT INTO student (fname, mname, lname, gender, age, user_id) VALUES
('Alice', 'M.', 'Johnson', 'F', 10, 3),
('Bob', 'L.', 'Smith', 'M', 11, NULL);

-- Insert Teachers
INSERT INTO teacher (fname, mname, lname, gender, status, user_id) VALUES
('John', 'A.', 'Doe', 'M', TRUE, 2),
('Jane', 'B.', 'Doe', 'F', TRUE, NULL);

-- Insert Subjects
INSERT INTO subject (subject_name) VALUES
('Mathematics'),
('Science'),
('English'),
('Social Studies'),
('Computer Science');

-- Insert Classes
INSERT INTO class (grade_level, section, class_description, school_year) VALUES
('5', 'A', 'Regular Class', '2023-2024'),
('6', 'B', 'Advanced Class', '2023-2024');

-- Insert Student Grades
INSERT INTO student_grade (student_id, class_id, subject_id, teacher_id, quarter, grade) VALUES
(1, 1, 1, 1, 1, 85.50),
(2, 2, 2, 1, 1, 90.00);

-- Insert Class-Student Relationships
INSERT INTO class_student (class_id, student_id) VALUES
(1, 1),
(2, 2);

-- Insert Class-Subject Relationships
INSERT INTO class_subject (class_id, subject_id, teacher_id) VALUES
(1, 1, 1),
(2, 2, 1);
