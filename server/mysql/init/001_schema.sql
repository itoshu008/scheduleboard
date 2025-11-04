CREATE TABLE IF NOT EXISTS departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  departmentId INT,
  color VARCHAR(16),
  FOREIGN KEY (departmentId) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS equipment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employeeId INT,
  departmentId INT,
  start DATETIME NOT NULL,
  end   DATETIME NOT NULL,
  color VARCHAR(16),
  note  TEXT,
  FOREIGN KEY (employeeId) REFERENCES employees(id),
  FOREIGN KEY (departmentId) REFERENCES departments(id),
  INDEX (start), INDEX (end)
);

CREATE TABLE IF NOT EXISTS equipment_reservations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  equipmentId INT NOT NULL,
  date DATE NOT NULL,
  start TIME NOT NULL,
  end   TIME NOT NULL,
  employeeId INT,
  note TEXT,
  FOREIGN KEY (equipmentId) REFERENCES equipment(id)
);

-- ダミーデータ（必要なら）
INSERT INTO departments (name) VALUES ('撮影部'),('編集部');
INSERT INTO employees (name, departmentId, color) VALUES ('田中',1,'#3498db'),('佐藤',2,'#e74c3c');
INSERT INTO equipment (name) VALUES ('Aスタジオ'),('ライティングB');


