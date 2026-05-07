CREATE DATABASE IF NOT EXISTS corpdb;
USE corpdb;

CREATE TABLE employees (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(50)  NOT NULL,
    password     VARCHAR(255) NOT NULL,
    full_name    VARCHAR(100),
    department   VARCHAR(50),
    position     VARCHAR(80),
    access_level INT DEFAULT 1,
    joined_date  DATE
);

INSERT INTO employees (username, password, full_name, department, position, access_level, joined_date) VALUES
('j.morrison', MD5('Sunrise@2019'), 'James Morrison',  'Engineering', 'Backend Developer',      1, '2019-03-12'),
('a.chen',     MD5('Monkey7734'),   'Alice Chen',       'Marketing',   'Campaign Manager',        1, '2020-07-01'),
('b.okafor',   MD5('Letmein99'),    'Benjamin Okafor',  'HR',          'Talent Acquisition Lead', 1, '2018-11-22'),
('s.reeves',   MD5('N3xBank2021'),  'Sandra Reeves',    'Finance',     'Risk Analyst',            3, '2021-02-09'),
('sysadmin',   MD5('Tr0ub4dor3'),   'System Admin',     'IT',          'Infrastructure Lead',     5, '2017-06-30');

CREATE TABLE vault (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    entry_name VARCHAR(100),
    secret     TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO vault (entry_name, secret) VALUES
('backup_key',   'YmFja3VwX2tleV8yMDI0X2NvcnBuZXQ='),
('vpn_seed',     '7a3f-9c12-4e56-ab01-cc82'),
('db_root_hint', 'Try the server hostname as password'),
('flag',         'Securinets{sql1_un10n_v4ult_ch4ng3_m3}');

CREATE TABLE announcements (
    id     INT AUTO_INCREMENT PRIMARY KEY,
    title  VARCHAR(200),
    body   TEXT,
    posted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO announcements (title, body) VALUES
('Maintenance Friday 03:00 UTC', 'Tables affected: employees, vault. Backup in progress.'),
('Security reminder', 'Do not share credentials. The vault table contains sensitive data.'),
('New onboarding portal', 'Contact b.okafor for HR system access.');
