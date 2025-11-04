-- スケジュール管理システム データベーススキーマ

-- データベース作成
CREATE DATABASE IF NOT EXISTS schedule_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE schedule_management;

-- 部署テーブル
CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 社員テーブル
CREATE TABLE employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_number VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    department_id INT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- スケジュールテーブル
CREATE TABLE schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#3174ad', -- HEX カラーコード
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_employee_datetime (employee_id, start_datetime, end_datetime),
    INDEX idx_datetime_range (start_datetime, end_datetime)
);

-- 設備テーブル
CREATE TABLE equipment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 設備予約テーブル
CREATE TABLE equipment_reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    employee_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#3174ad',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_equipment_datetime (equipment_id, start_datetime, end_datetime),
    INDEX idx_datetime_range (start_datetime, end_datetime)
);

-- 初期データ投入
INSERT INTO departments (name, display_order) VALUES 
('総務部', 1),
('営業部', 2),
('開発部', 3),
('経理部', 4);

INSERT INTO employees (employee_number, name, department_id, display_order) VALUES 
('E001', '田中太郎', 1, 1),
('E002', '佐藤花子', 1, 2),
('E003', '山田次郎', 2, 1),
('E004', '鈴木美香', 2, 2),
('E005', '高橋和也', 3, 1),
('E006', '渡辺真理', 3, 2),
('E007', '伊藤健一', 4, 1);

INSERT INTO equipment (name, description, display_order) VALUES 
('会議室A', '10人収容可能な会議室', 1),
('会議室B', '6人収容可能な会議室', 2),
('プロジェクター1', 'プレゼンテーション用', 3),
('車両1', '営業車両', 4);