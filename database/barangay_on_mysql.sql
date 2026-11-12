-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: barangay_on
-- ------------------------------------------------------
-- Server version	10.11.14-MariaDB-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_log`
--

DROP TABLE IF EXISTS `activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `username` varchar(50) NOT NULL,
  `action` varchar(60) NOT NULL,
  `detail` varchar(255) NOT NULL,
  `ip` varchar(45) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_activity_log_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_log`
--

LOCK TABLES `activity_log` WRITE;
/*!40000 ALTER TABLE `activity_log` DISABLE KEYS */;
INSERT INTO `activity_log` VALUES
(1,1,'admin','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:45'),
(2,1,'admin','Logout','Logged out','127.0.0.1','2026-11-01 10:00:46'),
(3,2,'captain','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:46'),
(4,2,'captain','Logout','Logged out','127.0.0.1','2026-11-01 10:00:46'),
(5,3,'resident','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:46'),
(6,3,'resident','Logout','Logged out','127.0.0.1','2026-11-01 10:00:46'),
(7,3,'resident','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:46'),
(8,3,'resident','Logout','Logged out','127.0.0.1','2026-11-01 10:00:46'),
(9,4,'staff','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:46'),
(10,4,'staff','Document approved','BRG-2026-00128 (Barangay Clearance) - approved, sent to the Captain for signing','127.0.0.1','2026-11-01 10:00:46'),
(11,4,'staff','Document request filed','BRG-2026-00129 (Certificate of Residency) for NON-REGISTERED person Walk In','127.0.0.1','2026-11-01 10:00:46'),
(12,4,'staff','Logout','Logged out','127.0.0.1','2026-11-01 10:00:46'),
(13,2,'captain','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:46'),
(14,2,'captain','Document signed','BRG-2026-00128 (signed by the Captain, sent back to staff for release)','127.0.0.1','2026-11-01 10:00:46'),
(15,2,'captain','Logout','Logged out','127.0.0.1','2026-11-01 10:00:46'),
(16,4,'staff','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:46'),
(17,4,'staff','Document released','BRG-2026-00128 (Barangay Clearance) - released','127.0.0.1','2026-11-01 10:00:46'),
(18,4,'staff','Logout','Logged out','127.0.0.1','2026-11-01 10:00:46'),
(19,1,'admin','Login successful','You logged in from 127.0.0.1','127.0.0.1','2026-11-01 10:00:46'),
(20,1,'admin','User created','Created staff account \'ns1\'','127.0.0.1','2026-11-01 10:00:46'),
(21,1,'admin','New captain','Term ended for the previous captain; \'cap2\' is now the Barangay Captain','127.0.0.1','2026-11-01 10:00:47');
/*!40000 ALTER TABLE `activity_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `posted_by` int(11) NOT NULL,
  `title` varchar(150) NOT NULL,
  `body` text NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `posted_by` (`posted_by`),
  CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcements`
--

LOCK TABLES `announcements` WRITE;
/*!40000 ALTER TABLE `announcements` DISABLE KEYS */;
INSERT INTO `announcements` VALUES
(1,1,'Barangay Assembly','All residents are invited to the barangay assembly this coming Saturday at the Barangay Hall.','2026-10-30 10:00:32'),
(2,4,'Clean-up Drive','Join our monthly clean-up drive. Gloves and bags will be provided.','2026-10-24 10:00:32'),
(3,1,'Hi','there','2026-11-01 10:00:47');
/*!40000 ALTER TABLE `announcements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(120) NOT NULL,
  `message` varchar(255) NOT NULL,
  `type` varchar(10) NOT NULL,
  `is_read` int(11) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES
(1,1,'New document request','Barangay Clearance (BRG-2026-00125) is pending approval.','info',0,'2026-11-01 08:00:32'),
(2,1,'New Complaint','Noise Complaint (CMP-2026-00014) is under review.','info',0,'2026-11-01 06:00:32'),
(3,1,'Community Report Update','Missing Person (RPT-2026-00008) has been marked as resolved.','warning',0,'2026-11-01 04:00:32'),
(4,1,'New Resident Registration','A new resident has registered in the system.','info',0,'2026-10-31 10:00:32'),
(5,1,'System Announcement','System maintenance is scheduled this weekend (9:00 PM - 11:00 PM).','alert',0,'2026-10-31 10:00:32'),
(6,2,'Documents waiting for signature','Several document requests are waiting for your signature.','warning',0,'2026-11-01 09:00:32'),
(7,3,'Request received','Your Barangay Clearance request is now being processed.','info',0,'2026-11-01 09:40:32'),
(8,3,'Complaint under review','Your complaint (CMP-2026-00003) is under review.','info',0,'2026-10-31 10:00:32'),
(9,3,'Document approved','Your Certificate of Residency has been approved and released.','success',0,'2026-10-23 10:00:32'),
(10,1,'New document','Barangay Clearance (BRG-2026-00128) was submitted by Justine Agulto.','info',0,'2026-11-01 10:00:46'),
(11,4,'New document','Barangay Clearance (BRG-2026-00128) was submitted by Justine Agulto.','info',0,'2026-11-01 10:00:46'),
(12,3,'Request received','Your request BRG-2026-00128 was submitted.','success',0,'2026-11-01 10:00:46'),
(13,1,'New complaint','Others (CMP-2026-00015) was submitted by Justine Agulto.','info',0,'2026-11-01 10:00:46'),
(14,4,'New complaint','Others (CMP-2026-00015) was submitted by Justine Agulto.','info',0,'2026-11-01 10:00:46'),
(15,3,'Request received','Your request CMP-2026-00015 was submitted.','success',0,'2026-11-01 10:00:46'),
(16,3,'Document approved','Your request BRG-2026-00128 was approved and sent to the Barangay Captain for signing.','info',0,'2026-11-01 10:00:46'),
(17,2,'Document waiting for signature','Staff approved a document request. It needs your signature.','warning',0,'2026-11-01 10:00:46'),
(18,3,'Document signed','Your request BRG-2026-00128 was signed by the Barangay Captain and is being prepared for release.','info',0,'2026-11-01 10:00:46'),
(19,4,'Document ready for release','The Barangay Captain signed a document. It is ready for you to release.','success',0,'2026-11-01 10:00:46'),
(20,3,'Document released','Your request BRG-2026-00128 was released. You may now claim it at the barangay hall.','success',0,'2026-11-01 10:00:46'),
(21,6,'New announcement','Hi','info',0,'2026-11-01 10:00:47'),
(22,2,'New announcement','Hi','info',0,'2026-11-01 10:00:47'),
(23,5,'New announcement','Hi','info',0,'2026-11-01 10:00:47'),
(24,3,'New announcement','Hi','info',0,'2026-11-01 10:00:47'),
(25,4,'New announcement','Hi','info',0,'2026-11-01 10:00:47');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `residents`
--

DROP TABLE IF EXISTS `residents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `residents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `first_name` varchar(60) NOT NULL,
  `last_name` varchar(60) NOT NULL,
  `address` varchar(150) NOT NULL,
  `birthdate` date DEFAULT NULL,
  `civil_status` varchar(20) DEFAULT NULL,
  `sex` varchar(10) DEFAULT NULL,
  `contact_no` varchar(20) NOT NULL,
  `status` varchar(12) NOT NULL,
  `created_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `is_walkin` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `residents_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `residents`
--

LOCK TABLES `residents` WRITE;
/*!40000 ALTER TABLE `residents` DISABLE KEYS */;
INSERT INTO `residents` VALUES
(1,3,'Justine','Agulto','Purok 1, Brgy. Sample',NULL,NULL,'09170000001','Registered','2026-11-01 10:00:32',NULL,0),
(2,NULL,'Juan','Dela Cruz','Purok 2, Brgy. Sample',NULL,NULL,'09170000002','Registered','2026-11-01 10:00:32',NULL,0),
(3,NULL,'Maria','Santos','Purok 3, Brgy. Sample',NULL,NULL,'09170000003','Registered','2026-11-01 10:00:32',NULL,0),
(4,NULL,'Carlos','Reyes','Purok 1, Brgy. Sample',NULL,NULL,'09170000004','Registered','2026-11-01 10:00:32',NULL,0),
(5,NULL,'Ana','Lopez','Purok 4, Brgy. Sample',NULL,NULL,'09170000005','Registered','2026-11-01 10:00:32',NULL,0),
(6,NULL,'Pedro','Ramos','Purok 5, Brgy. Sample',NULL,NULL,'09170000006','Registered','2026-11-01 10:00:32',NULL,0),
(7,NULL,'Liza','Mendoza','Purok 2, Brgy. Sample',NULL,NULL,'09170000007','Registered','2026-11-01 10:00:32',NULL,0),
(8,NULL,'Jose','Garcia','Purok 3, Brgy. Sample',NULL,NULL,'09170000008','Registered','2026-11-01 10:00:32',NULL,0),
(9,NULL,'Rosa','Bautista','Purok 4, Brgy. Sample',NULL,NULL,'09170000009','Registered','2026-11-01 10:00:32',NULL,0),
(10,NULL,'Mark','Villanueva','Purok 5, Brgy. Sample',NULL,NULL,'09170000010','Registered','2026-11-01 10:00:32',NULL,0),
(11,NULL,'Grace','Navarro','Purok 1, Brgy. Sample',NULL,NULL,'09170000011','Registered','2026-11-01 10:00:32',NULL,0),
(12,NULL,'Noel','Castillo','Purok 2, Brgy. Sample',NULL,NULL,'09170000012','Pending','2026-11-01 10:00:32',NULL,0),
(13,NULL,'Walk','In','',NULL,NULL,'','Inactive','2026-11-01 10:00:46',NULL,1),
(14,NULL,'Zed','Test','P9','1990-05-05','Single','0917','Registered','2026-11-01 10:00:47',NULL,0);
/*!40000 ALTER TABLE `residents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `services`
--

DROP TABLE IF EXISTS `services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `services` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `category` varchar(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `services`
--

LOCK TABLES `services` WRITE;
/*!40000 ALTER TABLE `services` DISABLE KEYS */;
INSERT INTO `services` VALUES
(1,'Barangay Clearance','document'),
(2,'Certificate of Residency','document'),
(3,'Certificate of Indigency','document'),
(4,'Business Permit','document'),
(5,'Noise Complaint','complaint'),
(6,'Neighbor Dispute','complaint'),
(7,'Missing Person','report'),
(8,'Suspicious Activity','report'),
(9,'Broken Streetlight','report'),
(10,'Others','complaint'),
(11,'Others','report');
/*!40000 ALTER TABLE `services` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tracking_no` varchar(30) NOT NULL,
  `resident_id` int(11) NOT NULL,
  `service_id` int(11) NOT NULL,
  `status` varchar(15) NOT NULL,
  `details` text DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `released_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `endorsed_at` datetime DEFAULT NULL,
  `endorsed_by` int(11) DEFAULT NULL,
  `signed_by` int(11) DEFAULT NULL,
  `signed_at` datetime DEFAULT NULL,
  `signed_by_name` varchar(100) DEFAULT NULL,
  `signature_snapshot` mediumtext DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tracking_no` (`tracking_no`),
  KEY `resident_id` (`resident_id`),
  KEY `service_id` (`service_id`),
  KEY `signed_by` (`signed_by`),
  KEY `ix_transactions_status` (`status`),
  KEY `ix_transactions_created_at` (`created_at`),
  KEY `ix_transactions_released_at` (`released_at`),
  CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`id`),
  CONSTRAINT `transactions_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`),
  CONSTRAINT `transactions_ibfk_3` FOREIGN KEY (`signed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES
(1,'BRG-2026-00126',1,1,'Pending','Needed for job application',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 09:30:32','2026-11-01 09:30:32'),
(2,'BRG-2026-00101',1,3,'Approved','For scholarship',NULL,NULL,'2026-11-01 09:40:32',4,'2026-11-01 09:40:32',4,NULL,NULL,NULL,NULL,'2026-10-30 10:00:32','2026-11-01 10:00:32'),
(3,'CMP-2026-00003',1,6,'Under Review','Boundary issue',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-29 10:00:32','2026-10-29 10:00:32'),
(4,'BRG-2026-00090',1,2,'Released','Proof of residency','2026-10-22 11:00:32',2,'2026-10-22 11:00:32',2,'2026-10-22 10:20:32',4,2,'2026-10-22 11:00:32',NULL,NULL,'2026-10-22 10:00:32','2026-10-22 10:00:32'),
(5,'BRG-2026-00070',1,1,'Released','Employment','2026-10-12 11:00:32',2,'2026-10-12 11:00:32',2,'2026-10-12 10:20:32',4,2,'2026-10-12 11:00:32',NULL,NULL,'2026-10-12 10:00:32','2026-10-12 10:00:32'),
(6,'RPT-2026-00002',1,9,'Resolved','Streetlight on Purok 1',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-17 10:00:32','2026-10-17 10:00:32'),
(7,'BRG-2026-00125',2,1,'Pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 09:00:32','2026-11-01 09:00:32'),
(8,'BRG-2026-00124',7,1,'Pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 08:00:32','2026-11-01 08:00:32'),
(9,'BRG-2026-00127',9,1,'Pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 07:00:32','2026-11-01 07:00:32'),
(10,'CMP-2026-00014',3,5,'Under Review','Loud karaoke at night',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-31 10:00:32','2026-10-31 10:00:32'),
(11,'BRG-2026-00123',8,3,'Approved',NULL,NULL,NULL,'2026-11-01 09:40:32',4,'2026-11-01 09:40:32',4,NULL,NULL,NULL,NULL,'2026-10-31 10:00:32','2026-11-01 10:00:32'),
(12,'BRG-2026-00122',9,4,'Released',NULL,'2026-10-30 11:00:32',2,'2026-10-30 11:00:32',2,'2026-10-30 10:20:32',4,2,'2026-10-30 11:00:32',NULL,NULL,'2026-10-30 10:00:32','2026-10-30 10:00:32'),
(13,'BRG-2026-00121',10,2,'Released',NULL,'2026-10-30 11:00:32',2,'2026-10-30 11:00:32',2,'2026-10-30 10:20:32',4,2,'2026-10-30 11:00:32',NULL,NULL,'2026-10-30 10:00:32','2026-10-30 10:00:32'),
(14,'RPT-2026-00008',4,7,'Resolved','Found safe',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-29 10:00:32','2026-10-29 10:00:32'),
(15,'CMP-2026-00013',11,6,'Under Review',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-29 10:00:32','2026-10-29 10:00:32'),
(16,'RPT-2026-00005',6,9,'Under Review',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-29 10:00:32','2026-10-29 10:00:32'),
(17,'CMP-2026-00012',12,5,'Resolved',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-28 10:00:32','2026-10-28 10:00:32'),
(18,'RPT-2026-00007',2,9,'Under Review',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-28 10:00:32','2026-10-28 10:00:32'),
(19,'BRG-2026-00120',5,2,'Approved',NULL,NULL,NULL,'2026-11-01 09:40:32',4,'2026-11-01 09:40:32',4,2,'2026-11-01 09:55:32',NULL,NULL,'2026-10-27 10:00:32','2026-11-01 10:00:32'),
(20,'BRG-2026-00119',3,1,'Released',NULL,'2026-10-27 11:00:32',2,'2026-10-27 11:00:32',2,'2026-10-27 10:20:32',4,2,'2026-10-27 11:00:32',NULL,NULL,'2026-10-27 10:00:32','2026-10-27 10:00:32'),
(21,'BRG-2026-00118',4,3,'Released',NULL,'2026-10-26 11:00:32',2,'2026-10-26 11:00:32',2,'2026-10-26 10:20:32',4,2,'2026-10-26 11:00:32',NULL,NULL,'2026-10-26 10:00:32','2026-10-26 10:00:32'),
(22,'BRG-2026-00117',5,1,'Released',NULL,'2026-10-26 11:00:32',2,'2026-10-26 11:00:32',2,'2026-10-26 10:20:32',4,2,'2026-10-26 11:00:32',NULL,NULL,'2026-10-26 10:00:32','2026-10-26 10:00:32'),
(23,'RPT-2026-00006',6,8,'Under Review',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-26 10:00:32','2026-10-26 10:00:32'),
(24,'BRG-2026-00110',7,2,'Released',NULL,'2026-10-20 11:00:32',2,'2026-10-20 11:00:32',2,'2026-10-20 10:20:32',4,2,'2026-10-20 11:00:32',NULL,NULL,'2026-10-20 10:00:32','2026-10-20 10:00:32'),
(25,'BRG-2026-00100',8,1,'Released',NULL,'2026-09-27 11:00:32',2,'2026-09-27 11:00:32',2,'2026-09-27 10:20:32',4,2,'2026-09-27 11:00:32',NULL,NULL,'2026-09-27 10:00:32','2026-09-27 10:00:32'),
(26,'BRG-2026-00099',9,1,'Released',NULL,'2026-09-24 11:00:32',2,'2026-09-24 11:00:32',2,'2026-09-24 10:20:32',4,2,'2026-09-24 11:00:32',NULL,NULL,'2026-09-24 10:00:32','2026-09-24 10:00:32'),
(27,'CMP-2026-00009',3,5,'Resolved',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-09-17 10:00:32','2026-09-17 10:00:32'),
(28,'BRG-2026-00080',2,3,'Released',NULL,'2026-08-28 11:00:32',2,'2026-08-28 11:00:32',2,'2026-08-28 10:20:32',4,2,'2026-08-28 11:00:32',NULL,NULL,'2026-08-28 10:00:32','2026-08-28 10:00:32'),
(29,'BRG-2026-00079',4,1,'Released',NULL,'2026-08-23 11:00:32',2,'2026-08-23 11:00:32',2,'2026-08-23 10:20:32',4,2,'2026-08-23 11:00:32',NULL,NULL,'2026-08-23 10:00:32','2026-08-23 10:00:32'),
(30,'RPT-2026-00004',5,9,'Resolved',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-18 10:00:32','2026-08-18 10:00:32'),
(31,'BRG-2026-00060',6,2,'Released',NULL,'2026-07-24 11:00:32',2,'2026-07-24 11:00:32',2,'2026-07-24 10:20:32',4,2,'2026-07-24 11:00:32',NULL,NULL,'2026-07-24 10:00:32','2026-07-24 10:00:32'),
(32,'CMP-2026-00006',7,6,'Resolved',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-07-19 10:00:32','2026-07-19 10:00:32'),
(33,'BRG-2026-00050',8,1,'Released',NULL,'2026-06-24 11:00:32',2,'2026-06-24 11:00:32',2,'2026-06-24 10:20:32',4,2,'2026-06-24 11:00:32',NULL,NULL,'2026-06-24 10:00:32','2026-06-24 10:00:32'),
(34,'BRG-2026-00040',9,4,'Released',NULL,'2026-05-25 11:00:32',2,'2026-05-25 11:00:32',2,'2026-05-25 10:20:32',4,2,'2026-05-25 11:00:32',NULL,NULL,'2026-05-25 10:00:32','2026-05-25 10:00:32'),
(35,'BRG-2026-00128',1,1,'Released','Document Type: Barangay Clearance\nFull Name: J A\nComplete Address: P1\nDate of Birth: 1990-01-01\nCivil Status: Single\nYear or Date You Started Residing in the Barangay: 2010\nPurpose of Request: Employment\nContact Number: 0917','2026-11-01 10:00:46',4,'2026-11-01 10:00:46',4,'2026-11-01 10:00:46',4,2,'2026-11-01 10:00:46','Roberto Dela Cruz','data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNzQgMTAwIj48ZyBmaWxsPSJub25lIiBzdHJva2U9IiMxYjNhOGYiIHN0cm9rZS13aWR0aD0iMi44IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMC4wIDY0IEMgMTguMCAzLjYsIDQ2LjAgLTAuNCwgNDAuMCA1MiBTIDI0LjAgNzgsIDU0LjAgNTggQyA1Ny44IDE1LjEsIDYzLjEgMTUuMSwgNjYuMiA1OCBTIDcyLjMgNjYsIDc1LjMgNjAgQyA3OS45IDI0LjQsIDg2LjQgMjQuNCwgOTAuMCA1OCBTIDk3LjQgNjYsIDEwMS4xIDYwIEMgMTA1LjEgMTIuNiwgMTEwLjcgMTIuNiwgMTEzLjkgNTggUyAxMjAuMyA2NiwgMTIzLjUgNjAgQyAxMjguMSAyMi43LCAxMzQuNiAyMi43LCAxMzguMyA1OCBTIDE0NS43IDY2LCAxNDkuNCA2MCIvPjxwYXRoIGQ9Ik0xMCA4MCBDIDU1LjggNzMuMSwgMTExLjYgODUuOSwgMTU5LjQgNzUuMSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9nPjwvc3ZnPg==','2026-11-01 10:00:46','2026-11-01 10:00:46'),
(36,'CMP-2026-00015',1,10,'Under Review','Type (Others): Dogs\nd',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 10:00:46','2026-11-01 10:00:46'),
(37,'BRG-2026-00129',13,2,'Pending','Document Type: Certificate of Residency\nFull Name: Walk In\nComplete Address: x\nDate of Birth: 1980-02-02\nCivil Status: Married\nYear or Date You Started Residing in the Barangay: 2000\nPurpose of Request: Travel\nContact Number: 0917\nFiled at the barangay hall by staff: Ana Reyes on 2026-11-01',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-11-01 10:00:46','2026-11-01 10:00:46');
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_permissions`
--

DROP TABLE IF EXISTS `user_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_permissions` (
  `user_id` int(11) NOT NULL,
  `permission` varchar(40) NOT NULL,
  PRIMARY KEY (`user_id`,`permission`),
  CONSTRAINT `user_permissions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_permissions`
--

LOCK TABLES `user_permissions` WRITE;
/*!40000 ALTER TABLE `user_permissions` DISABLE KEYS */;
INSERT INTO `user_permissions` VALUES
(4,'approve_documents'),
(4,'manage_complaints'),
(4,'post_announcements'),
(5,'view_reports');
/*!40000 ALTER TABLE `user_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_settings`
--

DROP TABLE IF EXISTS `user_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_settings` (
  `user_id` int(11) NOT NULL,
  `theme` varchar(10) NOT NULL,
  `font_size` varchar(10) NOT NULL,
  `density` varchar(12) NOT NULL,
  `sidebar_collapsed` int(11) NOT NULL,
  `date_format` varchar(6) NOT NULL,
  `time_format` varchar(4) NOT NULL,
  `default_page` varchar(30) NOT NULL,
  `page_size` int(11) NOT NULL,
  `notify_announcements` int(11) NOT NULL,
  `notify_requests` int(11) NOT NULL,
  `session_timeout` int(11) NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `user_settings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_settings`
--

LOCK TABLES `user_settings` WRITE;
/*!40000 ALTER TABLE `user_settings` DISABLE KEYS */;
INSERT INTO `user_settings` VALUES
(1,'dark','medium','comfortable',0,'mdy','12h','dashboard',25,1,1,0,'2026-11-01 10:00:47');
/*!40000 ALTER TABLE `user_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `position` varchar(80) NOT NULL,
  `role` varchar(10) NOT NULL,
  `avatar` varchar(80) DEFAULT NULL,
  `signature` mediumtext DEFAULT NULL,
  `term_start` date DEFAULT NULL,
  `term_ended_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'admin','$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','Maria Santos','Administrator','admin',NULL,NULL,NULL,NULL,'2026-11-01 10:00:32'),
(2,'captain','$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','Roberto Dela Cruz','Barangay Captain','captain',NULL,NULL,NULL,'2026-11-01 10:00:46','2026-11-01 10:00:32'),
(3,'resident','$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','Justine Agulto','Resident','resident',NULL,NULL,NULL,NULL,'2026-11-01 10:00:32'),
(4,'staff','$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi','Ana Reyes','Barangay Staff','staff',NULL,NULL,NULL,NULL,'2026-11-01 10:00:32'),
(5,'ns1','$2b$10$vL9wifBqygItgIh/Ts.aUeJ99ST3kUBKDLF6j6LTU99K0PdqWuUQi','N S','Barangay Staff','staff',NULL,NULL,NULL,NULL,'2026-11-01 10:00:46'),
(6,'cap2','$2b$10$ZU.0WTucgKQlW2NlJqmRdOD5kmAWmIpLlHnPpC5G0bjecFgJaIxIm','Cap Two','Punong Barangay','captain',NULL,NULL,'2026-11-01',NULL,'2026-11-01 10:00:47');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-01 10:00:55
