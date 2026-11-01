#!/usr/bin/env python3
"""Generate and audit the complete 1992 Upper Deck Baseball unreleased draft.

Offline by default. --check compares committed CSV without writing;
--self-test exercises all audit/corruption checks; --refresh-sources re-fetches
every required source and checks reviewed scans. Any failed retrieval or audit
prevents output. Rookie/odds review limits are explicit in bundle/research notes.
No database access occurs in this generator.
"""
from __future__ import annotations
import argparse
import copy
import csv
import hashlib
import html
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'set-factory'
STEM = '1992-upper-deck-baseball'
BUNDLE = DATA / (STEM + '.bundle.json')
SOURCE = DATA / (STEM + '.source.json')
OUT = DATA / (STEM + '.cards.csv')
HEADER = ['setKey', 'cardNumber', 'player', 'team', 'subset', 'variant']
TOTAL = 1774
KNOWN_CLUBS = {
    "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox",
    "California Angels", "Chicago Cubs", "Chicago White Sox",
    "Cincinnati Reds", "Cleveland Indians", "Detroit Tigers",
    "Houston Astros", "Kansas City Royals", "Los Angeles Dodgers",
    "Milwaukee Brewers", "Minnesota Twins", "Montreal Expos",
    "New York Mets", "New York Yankees", "Oakland Athletics",
    "Philadelphia Phillies", "Pittsburgh Pirates", "St. Louis Cardinals",
    "San Diego Padres", "San Francisco Giants", "Seattle Mariners",
    "Texas Rangers", "Toronto Blue Jays",
    "Colorado Rockies", "Florida Marlins", "Anaheim Angels",
    "American League", "National League", "Atlanta Falcons",
    "Stanford Cardinal", "Arizona State Sun Devils", "LSU Tigers",
}
class Rows(HTMLParser):
    """Retain captions separately, including when source markup omits spaces."""

    def __init__(self, expected_sid=None):
        super().__init__()
        self.expected_sid = expected_sid
        self.card_sids = set()
        self.rows = []
        self.row = None
        self.cell = None
        self.caption = False
        self.link = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
            self.link = False
            self.card_sids = set()
        elif tag == 'td' and self.row is not None:
            self.cell = {'label': [], 'note': []}
        elif tag == 'figcaption' and self.cell is not None:
            self.caption = True
        elif tag == 'br' and self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(' ')
        elif tag == 'a' and self.row is not None:
            href = dict(attrs).get('href', '')
            if 'ViewCard.cfm' in href:
                self.link = True
                sid = re.search(r'/sid/(\d+)/', href)
                if sid:
                    self.card_sids.add(int(sid[1]))

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['note' if self.caption else 'label'].append(data)

    def handle_endtag(self, tag):
        if tag == 'figcaption':
            self.caption = False
        elif tag == 'td' and self.cell is not None:
            self.row.append({k: ' '.join(''.join(v).split()) for k, v in self.cell.items()})
            self.cell = None
            self.caption = False
        elif tag == 'tr' and self.row is not None:
            if self.link:
                if self.expected_sid is not None and self.card_sids != {self.expected_sid}:
                    raise ValueError(f'Wrong source card-set namespace: {self.card_sids}; expected {self.expected_sid}')
                self.rows.append(self.row)
            self.row = None


NUM = re.compile(r'^(?:\d{1,3}[abf]?|(?:HR|SR|HI|HH|CP|SP|AU|H|T)\d{1,2}|U-\d{1,3}|NNO)$', re.I)


def parse(raw, expected_sid=None):
    parser = Rows(expected_sid=expected_sid)
    parser.feed(raw)
    out = []
    for row in parser.rows:
        cells = [c for c in row if c['label']]
        for i, cell in enumerate(cells):
            if NUM.fullmatch(cell['label']) and i + 1 < len(cells):
                label = cells[i + 1]
                rest = cells[i + 2:]
                if len(rest) > 1:
                    raise ValueError(f'Unexpected checklist columns: {rest}')
                out.append([cell['label'].upper(), label['label'],
                            rest[0]['label'] if rest else '', label['note']])
                break
    return out



SECTIONS = {'base': 'Base_Set', 'special-prints': 'SP', 'williams-heroes': 'Ted_Williams_Baseball_Heroes', 'williams-hologram': 'Ted_Williams_Hologram', 'homerun-heroes': 'Home_Run_Heroes', 'heroes-event': 'Heroes_of_Baseball', 'bench-morgan-heroes': 'Johnny_Bench_/_Joe_Morgan_Baseball_Heroes', 'williams-best': "Ted_Williams'_Best", 'scouting-report': 'Scouting_Report', 'college-holograms': 'College_Players_of_the_Year_Hologram', 'heroes-highlights': 'Heroes_Highlights', 'heroes-event-autos': 'Heroes_of_Baseball_Autographs', 'heroes-autos': 'Williams_&_Bench/Morgan_Heroes_Autographs'}
EXPECTED = {'base': {'458', '291', '731', '121', '407', '708', '120', '541', '511', '547', '170', '299', '756', '447', '225', '394', '693', '600', '684', '451', '197', '94', '97', '574', '296', '543', '480', '187', '317', '671', '573', '663', '522', '158', '455', '515', '144', '798', '96', '90', '601', '638', '368', '682', '238', '586', '556', '754', '287', '112', '770', '800', '745', '462', '485', '677', '41', '95', '273', '321', '113', '470', '408', '392', '717', '308', '265', '759', '133', '793', '359', '452', '797', '643', '232', '254', '409', '81', '785', '126', '268', '562', '644', '514', '618', '222', '393', '696', '194', '267', '61', '115', '374', '69', '242', '358', '386', '118', '569', '9', '635', '165', '76', '186', '707', '155', '481', '768', '436', '164', '647', '432', '529', '83', '483', '86', '85', '773', '63', '27', '433', '639', '620', '774', '373', '334', '502', '443', '444', '180', '323', '612', '40', '388', '763', '325', '738', '52', '476', '60', '153', '606', '714', '416', '29', '44', '636', '51', '375', '729', '548', '465', '466', '561', '578', '108', '276', '453', '216', '403', '399', '109', '456', '531', '110', '298', '309', '597', '214', '210', '580', '788', '189', '307', '594', '376', '630', '228', '318', '240', '367', '730', '3', '88', '536', '762', '796', '47', '221', '748', '266', '706', '668', '592', '351', '361', '445', '659', '332', '116', '302', '198', '190', '520', '477', '324', '114', '306', '333', '271', '206', '102', '463', '209', '736', '391', '629', '680', '385', '92', '73', '146', '7', '792', '539', '617', '633', '724', '721', '760', '74', '435', '212', '427', '615', '523', '278', '687', '173', '239', '506', '304', '725', '131', '8', '42', '513', '263', '475', '106', '107', '350', '468', '526', '49', '141', '704', '681', '422', '203', '262', '378', '319', '507', '652', '610', '177', '253', '129', '689', '692', '390', '676', '101', '62', '174', '295', '379', '732', '746', '395', '125', '786', '656', '5', '549', '517', '18', '245', '59', '631', '188', '290', '269', '479', '178', '415', '457', '103', '509', '363', '12', '674', '510', '602', '694', '383', '559', '555', '595', '369', '603', '653', '14', '697', '237', '230', '75', '491', '550', '136', '501', '564', '30', '362', '4', '294', '185', '417', '486', '546', '128', '634', '23', '525', '795', '316', '645', '6', '625', '93', '48', '654', '405', '122', '766', '364', '168', '473', '446', '161', '505', '791', '776', '437', '80', '68', '371', '495', '781', '328', '280', '28', '490', '710', '281', '36', '672', '683', '64', '231', '311', '552', '196', '757', '589', '45', '176', '172', '460', '336', '771', '204', '459', '256', '632', '439', '740', '582', '154', '537', '741', '675', '346', '627', '623', '619', '752', '16', '33', '43', '71', '387', '530', '614', '13', '246', '150', '448', '349', '753', '488', '598', '761', '787', '329', '648', '540', '347', '690', '751', '669', '551', '646', '226', '357', '26', '139', '171', '193', '381', '46', '140', '235', '1', '264', '624', '152', '223', '335', '157', '596', '360', '410', '277', '498', '780', '252', '420', '419', '711', '151', '527', '487', '353', '590', '54', '251', '320', '372', '718', '429', '560', '577', '650', '758', '519', '31', '289', '258', '15', '703', '202', '24', '345', '421', '701', '545', '79', '20', '175', '705', '314', '32', '105', '229', '508', '723', '167', '261', '406', '484', '535', '137', '67', '789', '640', '591', '270', '402', '678', '702', '576', '127', '726', '339', '119', '213', '657', '492', '117', '215', '259', '220', '148', '628', '284', '370', '191', '211', '145', '571', '236', '467', '554', '342', '257', '149', '608', '747', '104', '219', '765', '605', '715', '17', '686', '411', '355', '162', '217', '534', '37', '712', '434', '35', '82', '662', '512', '418', '744', '440', '50', '260', '199', '570', '397', '166', '57', '344', '533', '130', '658', '132', '250', '208', '98', '557', '588', '99', '56', '720', '338', '518', '516', '330', '134', '621', '244', '581', '425', '274', '322', '384', '772', '728', '25', '227', '100', '565', '611', '461', '91', '293', '778', '272', '641', '472', '587', '159', '192', '670', '77', '183', '777', '241', '613', '303', '471', '542', '366', '665', '10', '637', '503', '34', '331', '401', '249', '424', '609', '544', '442', '354', '218', '524', '688', '22', '282', '783', '742', '377', '599', '179', '626', '779', '39', '143', '343', '769', '799', '664', '767', '661', '300', '380', '195', '713', '123', '593', '224', '583', '66', '764', '735', '558', '243', '413', '622', '538', '478', '604', '660', '575', '70', '156', '494', '616', '315', '89', '563', '326', '398', '255', '496', '301', '579', '482', '700', '181', '356', '474', '755', '233', '38', '567', '585', '428', '426', '84', '607', '297', '65', '400', '19', '205', '691', '790', '733', '784', '207', '695', '438', '423', '722', '2', '642', '649', '719', '87', '184', '327', '283', '504', '404', '709', '337', '340', '667', '111', '247', '716', '414', '396', '200', '553', '248', '234', '312', '288', '469', '750', '666', '532', '775', '292', '521', '782', '352', '78', '341', '572', '441', '147', '449', '55', '201', '430', '497', '382', '124', '454', '685', '493', '182', '500', '58', '138', '53', '412', '734', '450', '431', '651', '163', '275', '699', '499', '135', '737', '279', '673', '169', '489', '365', '313', '464', '698', '568', '21', '727', '794', '11', '679', '739', '142', '566', '584', '310', '389', '743', '160', '655', '528', '348', '749', '285', '72', '305', '286'}, 'gold-hologram': {'458', '291', '731', '121', '407', '708', '120', '541', '511', '547', '170', '299', '756', '447', '225', '394', '693', '600', '684', '451', '197', '94', '97', '574', '296', '543', '480', '187', '317', '671', '573', '663', '522', '158', '455', '515', '144', '798', '96', '90', '601', '638', '368', '682', '238', '586', '556', '754', '287', '112', '770', '800', '745', '462', '485', '677', '41', '95', '273', '321', '113', '470', '408', '392', '717', '308', '265', '759', '133', '793', '359', '452', '797', '643', '232', '254', '409', '81', '785', '126', '268', '562', '644', '514', '618', '222', '393', '696', '194', '267', '61', '115', '374', '69', '242', '358', '386', '118', '569', '9', '635', '165', '76', '186', '707', '155', '481', '768', '436', '164', '647', '432', '529', '83', '483', '86', '85', '773', '63', '27', '433', '639', '620', '774', '373', '334', '502', '443', '444', '180', '323', '612', '40', '388', '763', '325', '738', '52', '476', '60', '153', '606', '714', '416', '29', '44', '636', '51', '375', '729', '548', '465', '466', '561', '578', '108', '276', '453', '216', '403', '399', '109', '456', '531', '110', '298', '309', '597', '214', '210', '580', '788', '189', '307', '594', '376', '630', '228', '318', '240', '367', '730', '3', '88', '536', '762', '796', '47', '221', '748', '266', '706', '668', '592', '351', '361', '445', '659', '332', '116', '302', '198', '190', '520', '477', '324', '114', '306', '333', '271', '206', '102', '463', '209', '736', '391', '629', '680', '385', '92', '73', '146', '7', '792', '539', '617', '633', '724', '721', '760', '74', '435', '212', '427', '615', '523', '278', '687', '173', '239', '506', '304', '725', '131', '8', '42', '513', '263', '475', '106', '107', '350', '468', '526', '49', '141', '704', '681', '422', '203', '262', '378', '319', '507', '652', '610', '177', '253', '129', '689', '692', '390', '676', '101', '62', '174', '295', '379', '732', '746', '395', '125', '786', '656', '5', '549', '517', '18', '245', '59', '631', '188', '290', '269', '479', '178', '415', '457', '103', '509', '363', '12', '674', '510', '602', '694', '383', '559', '555', '595', '369', '603', '653', '14', '697', '237', '230', '75', '491', '550', '136', '501', '564', '30', '362', '4', '294', '185', '417', '486', '546', '128', '634', '23', '525', '795', '316', '645', '6', '625', '93', '48', '654', '405', '122', '766', '364', '168', '473', '446', '161', '505', '791', '776', '437', '80', '68', '371', '495', '781', '328', '280', '28', '490', '710', '281', '36', '672', '683', '64', '231', '311', '552', '196', '757', '589', '45', '176', '172', '460', '336', '771', '204', '459', '256', '632', '439', '740', '582', '154', '537', '741', '675', '346', '627', '623', '619', '752', '16', '33', '43', '71', '387', '530', '614', '13', '246', '150', '448', '349', '753', '488', '598', '761', '787', '329', '648', '540', '347', '690', '751', '669', '551', '646', '226', '357', '26', '139', '171', '193', '381', '46', '140', '235', '1', '264', '624', '152', '223', '335', '157', '596', '360', '410', '277', '498', '780', '252', '420', '419', '711', '151', '527', '487', '353', '590', '54', '251', '320', '372', '718', '429', '560', '577', '650', '758', '519', '31', '289', '258', '15', '703', '202', '24', '345', '421', '701', '545', '79', '20', '175', '705', '314', '32', '105', '229', '508', '723', '167', '261', '406', '484', '535', '137', '67', '789', '640', '591', '270', '402', '678', '702', '576', '127', '726', '339', '119', '213', '657', '492', '117', '215', '259', '220', '148', '628', '284', '370', '191', '211', '145', '571', '236', '467', '554', '342', '257', '149', '608', '747', '104', '219', '765', '605', '715', '17', '686', '411', '355', '162', '217', '534', '37', '712', '434', '35', '82', '662', '512', '418', '744', '440', '50', '260', '199', '570', '397', '166', '57', '344', '533', '130', '658', '132', '250', '208', '98', '557', '588', '99', '56', '720', '338', '518', '516', '330', '134', '621', '244', '581', '425', '274', '322', '384', '772', '728', '25', '227', '100', '565', '611', '461', '91', '293', '778', '272', '641', '472', '587', '159', '192', '670', '77', '183', '777', '241', '613', '303', '471', '542', '366', '665', '10', '637', '503', '34', '331', '401', '249', '424', '609', '544', '442', '354', '218', '524', '688', '22', '282', '783', '742', '377', '599', '179', '626', '779', '39', '143', '343', '769', '799', '664', '767', '661', '300', '380', '195', '713', '123', '593', '224', '583', '66', '764', '735', '558', '243', '413', '622', '538', '478', '604', '660', '575', '70', '156', '494', '616', '315', '89', '563', '326', '398', '255', '496', '301', '579', '482', '700', '181', '356', '474', '755', '233', '38', '567', '585', '428', '426', '84', '607', '297', '65', '400', '19', '205', '691', '790', '733', '784', '207', '695', '438', '423', '722', '2', '642', '649', '719', '87', '184', '327', '283', '504', '404', '709', '337', '340', '667', '111', '247', '716', '414', '396', '200', '553', '248', '234', '312', '288', '469', '750', '666', '532', '775', '292', '521', '782', '352', '78', '341', '572', '441', '147', '449', '55', '201', '430', '497', '382', '124', '454', '685', '493', '182', '500', '58', '138', '53', '412', '734', '450', '431', '651', '163', '275', '699', '499', '135', '737', '279', '673', '169', '489', '365', '313', '464', '698', '568', '21', '727', '794', '11', '679', '739', '142', '566', '584', '310', '389', '743', '160', '655', '528', '348', '749', '285', '72', '305', '286'}, 'special-prints': {'SP4', 'SP3'}, 'williams-hologram': {'HH2'}, 'bench-morgan-heroes': {'37', '42', 'NNO', '39', '41', '40', '45', '44', '38', '43'}, 'bench-morgan-auto': {'45'}, 'williams-heroes': {'31', '35', '34', '32', 'NNO', '36', '29', '30', '28', '33'}, 'williams-auto': {'36'}, 'college-holograms': {'CP2', 'CP3', 'CP1'}, 'heroes-highlights': {'HI6', 'HI10', 'HI1', 'HI8', 'HI7', 'HI5', 'HI9', 'HI2', 'HI4', 'HI3'}, 'heroes-event': {'H6', 'H7', 'H5', 'H8'}, 'heroes-event-autos': {'H6', 'H7', 'H5'}, 'pennant-holograms': {'NNO-11', 'NNO-21', 'NNO-20', 'NNO-16', 'NNO-22', 'NNO-05', 'NNO-12', 'NNO-08', 'NNO-13', 'NNO-07', 'NNO-10', 'NNO-04', 'NNO-02', 'NNO-25', 'NNO-19', 'NNO-17', 'NNO-23', 'NNO-01', 'NNO-06', 'NNO-26', 'NNO-28', 'NNO-14', 'NNO-09', 'NNO-15', 'NNO-24', 'NNO-18', 'NNO-27', 'NNO-03'}, 'homerun-heroes': {'HR25', 'HR4', 'HR15', 'HR23', 'HR18', 'HR24', 'HR9', 'HR12', 'HR22', 'HR1', 'HR20', 'HR11', 'HR6', 'HR2', 'HR3', 'HR14', 'HR21', 'HR19', 'HR10', 'HR16', 'HR17', 'HR8', 'HR13', 'HR26', 'HR5', 'HR7'}, 'scouting-report': {'SR6', 'SR2', 'SR12', 'SR23', 'SR25', 'SR3', 'SR22', 'SR16', 'SR14', 'SR21', 'SR10', 'SR4', 'SR20', 'SR7', 'SR15', 'SR1', 'SR19', 'SR13', 'SR18', 'SR9', 'SR11', 'SR17', 'SR24', 'SR5', 'SR8'}, 'team-holograms': {'NNO-11', 'NNO-21', 'NNO-20', 'NNO-16', 'NNO-22', 'NNO-05', 'NNO-12', 'NNO-30', 'NNO-08', 'NNO-13', 'NNO-07', 'NNO-10', 'NNO-04', 'NNO-02', 'NNO-25', 'NNO-19', 'NNO-17', 'NNO-23', 'NNO-01', 'NNO-06', 'NNO-26', 'NNO-28', 'NNO-14', 'NNO-29', 'NNO-09', 'NNO-15', 'NNO-24', 'NNO-18', 'NNO-27', 'NNO-03'}, 'williams-best': {'T7', 'T1', 'T15', 'T9', 'T17', 'T8', 'T20', 'T2', 'T4', 'T12', 'T10', 'T16', 'T5', 'T18', 'T13', 'T14', 'T19', 'T3', 'T6', 'T11'}}
SOURCE_ROOKIES = {'57', '71', '614', '54', '667', '731', '710', '23', '773', '63', '625', '774', '786', '10', '312', '3', '59', '42', '757', '621', '701', '775', '45', '21', '562', '772', '12', '526', '794', '674', '566', '779', '69', '55', '664', '776', '67', '778', '68', '75', '780', '66', '58', '73', '43'}
FRANCHISES = {'Detroit Tigers', 'Philadelphia Phillies', 'Minnesota Twins', 'Houston Astros', 'San Diego Padres', 'Atlanta Braves', 'Cincinnati Reds', 'Chicago Cubs', 'Cleveland Indians', 'Chicago White Sox', 'Colorado Rockies', 'Baltimore Orioles', 'Oakland Athletics', 'California Angels', 'New York Yankees', 'Seattle Mariners', 'Los Angeles Dodgers', 'San Francisco Giants', 'Toronto Blue Jays', 'Kansas City Royals', 'Florida Marlins', 'Texas Rangers', 'Montreal Expos', 'New York Mets', 'Milwaukee Brewers', 'Boston Red Sox', 'St. Louis Cardinals', 'Pittsburgh Pirates'}
EARLIER = {'12': '1989 Topps Big #308', '45': '1991 Fleer Update #U-86', '57': '1991 Upper Deck Final Edition #25F', '58': '1991 Upper Deck Final Edition #7F', '526': '1991 Upper Deck Final Edition #27F', '566': '1991 Donruss The Rookies #23', '621': '1991 Ultra Update #U-17', '625': '1991 Ultra Update #U-60'}
COMPOSITES = {1: 'Jim Thome / Ryan Klesko', 51: 'Rondell White / Marc Newfield', 79: 'Pedro Martinez / Ramon Martinez', 80: 'Keith Mitchell / Kevin Mitchell', 81: 'Sandy Alomar Jr. / Roberto Alomar', 82: 'Cal Ripken Jr. / Billy Ripken', 83: 'Tony Gwynn / Chris Gwynn', 84: 'Dwight Gooden / Gary Sheffield', 85: 'Ken Griffey Jr. / Ken Griffey Sr. / Craig Griffey', 640: 'Jose Canseco / Rickey Henderson', 711: 'Barry Bonds / Andy Van Slyke', 770: 'Donovan Osborne'}
RAW_COMPOSITES = {'base': {'1': 'Star Rookie Checklist (Ryan Klesko / Jim Thome) SR, CL', '51': 'Top Prospect Checklist (Marc Newfield / Rondell White) TP, CL', '54': 'David Zancanaro TP, RC', '79': 'Pedro & Ramon BL', '80': 'Keith Mitchell / Kevin Mitchell BL', '81': 'Roberto Alomar / Sandy Alomar Jr. BL', '82': 'Cal Jr. & Billy BL', '83': 'Chris Gwynn / Tony Gwynn BL', '84': 'Gary & Dwight BL', '85': 'Ken Sr., Craig & Ken Jr. BL', '640': 'Diamond Skills Checklist (Rickey Henderson / Jose Canseco) DS, CL', '711': 'Diamond Skills Checklist (Barry Bonds / Andy Van Slyke) DS, CL', '752': 'Ruben Amaro Jr.', '770': 'Diamond Debuts Checklist (Donovan Osborne) DD, CL'}, 'gold-hologram': {'1': 'Star Rookie Checklist (Ryan Klesko / Jim Thome) SR, CL', '51': 'Top Prospect Checklist TP, CL', '54': 'Dave Zancanaro TP', '79': 'Pedro Martinez / Ramon Martinez BL', '80': 'Keith Mitchell / Kevin Mitchell BL', '81': 'Sandy Alomar Jr. / Roberto Alomar BL', '82': 'Cal Ripken Jr. / Billy Ripken BL', '83': 'Tony Gwynn / Chris Gwynn BL', '84': 'Dwight Gooden / Gary Sheffield BL', '85': 'Ken Griffey Sr. / Craig Griffey / Ken Griffey Jr. BL', '640': 'Diamond Skills Checklist DS, CL', '711': 'Diamond Skills Checklist DS, CL', '752': 'Ruben Amaro', '770': 'Diamond Debuts Checklist DD, CL'}}
RAW_GOLD_DIFFERENCES = {'1': (['Star Rookie Checklist (Ryan Klesko / Jim Thome) SR, CL', 'Atlanta Braves / Cleveland Indians'], ['Star Rookie Checklist (Ryan Klesko / Jim Thome) SR, CL', 'Cleveland Indians / Atlanta Braves']), '3': (['Brian Jordan SR, RC', 'St. Louis Cardinals'], ['Brian Jordan SR', 'St. Louis Cardinals']), '8': (['Kyle Abbott UER, SR', 'California Angels'], ['Kyle Abbott SR', 'California Angels']), '10': (['Rob Maurer SR, RC', 'Texas Rangers'], ['Rob Maurer SR', 'Texas Rangers']), '12': (['Ted Wood SR, RC', 'San Francisco Giants'], ['Ted Wood SR', 'San Francisco Giants']), '21': (['Braulio Castillo SR, RC', 'Philadelphia Phillies'], ['Braulio Castillo SR', 'Philadelphia Phillies']), '23': (['Brian Williams SR, RC', 'Houston Astros'], ['Brian Williams SR', 'Houston Astros']), '28': (['Dave Winfield', 'California Angels / San Diego Padres / New York Yankees'], ['Dave Winfield', 'San Diego Padres / New York Yankees / California Angels']), '29': (['David Justice CL', 'Atlanta Braves'], ['David Justice TC, CL', 'Atlanta Braves']), '30': (['Rob Dibble CL', 'Cincinnati Reds'], ['Rob Dibble TC, CL', 'Cincinnati Reds']), '31': (['Craig Biggio CL', 'Houston Astros'], ['Craig Biggio TC, CL', 'Houston Astros']), '32': (['Eddie Murray CL', 'Los Angeles Dodgers'], ['Eddie Murray TC, CL', 'Los Angeles Dodgers']), '33': (['Fred McGriff CL', 'San Diego Padres'], ['Fred McGriff TC, CL', 'San Diego Padres']), '34': (['Willie McGee CL', 'San Francisco Giants'], ['Willie McGee TC, CL', 'San Francisco Giants']), '35': (['Shawon Dunston CL', 'Chicago Cubs'], ['Shawon Dunston TC, CL', 'Chicago Cubs']), '36': (['Delino DeShields CL', 'Montreal Expos'], ['Delino DeShields TC, CL', 'Montreal Expos']), '37': (['Howard Johnson CL', 'New York Mets'], ['Howard Johnson TC, CL', 'New York Mets']), '38': (['John Kruk CL', 'Philadelphia Phillies'], ['John Kruk TC, CL', 'Philadelphia Phillies']), '39': (['Doug Drabek CL', 'Pittsburgh Pirates'], ['Doug Drabek TC, CL', 'Pittsburgh Pirates']), '40': (['Todd Zeile CL', 'St. Louis Cardinals'], ['Todd Zeile TC, CL', 'St. Louis Cardinals']), '42': (['Jeremy Hernandez RC', 'San Diego Padres'], ['Jeremy Hernandez', 'San Diego Padres']), '43': (['Doug Henry RC', 'Milwaukee Brewers'], ['Doug Henry', 'Milwaukee Brewers']), '45': (['Mo Sanford RC', 'Cincinnati Reds'], ['Mo Sanford', 'Cincinnati Reds']), '51': (['Top Prospect Checklist (Marc Newfield / Rondell White) TP, CL', 'Montreal Expos / Seattle Mariners'], ['Top Prospect Checklist TP, CL', 'Montreal Expos / Seattle Mariners']), '54': (['David Zancanaro TP, RC', 'Oakland Athletics'], ['Dave Zancanaro TP', 'Oakland Athletics']), '55': (['Shawn Green TP, RC', 'Toronto Blue Jays'], ['Shawn Green TP', 'Toronto Blue Jays']), '57': (['Dave Nilsson TP, RC', 'Milwaukee Brewers'], ['Dave Nilsson TP', 'Milwaukee Brewers']), '58': (['Dmitri Young TP, RC', 'St. Louis Cardinals'], ['Dmitri Young TP', 'St. Louis Cardinals']), '59': (['Ryan Hawblitzel TP, RC', 'Chicago Cubs'], ['Ryan Hawblitzel TP', 'Chicago Cubs']), '63': (['Manny Ramirez TP, RC', 'Cleveland Indians'], ['Manny Ramirez TP', 'Cleveland Indians']), '66': (['Mark Smith TP, RC', 'Baltimore Orioles'], ['Mark Smith TP', 'Baltimore Orioles']), '67': (['Joey Hamilton TP, RC', 'San Diego Padres'], ['Joey Hamilton TP', 'San Diego Padres']), '68': (['Tyler Green TP, RC', 'Philadelphia Phillies'], ['Tyler Green TP', 'Philadelphia Phillies']), '69': (['Jon Farrell TP, RC', 'Pittsburgh Pirates'], ['Jon Farrell TP', 'Welland Pirates']), '71': (['Jeff Plympton TP, RC', 'Boston Red Sox'], ['Jeff Plympton TP', 'Boston Red Sox']), '73': (['Joe Vitiello TP, RC', 'Kansas City Royals'], ['Joe Vitiello TP', 'Kansas City Royals']), '75': (['David McCarty TP, RC', 'Minnesota Twins'], ['David McCarty TP', 'Minnesota Twins']), '79': (['Pedro & Ramon BL', 'Los Angeles Dodgers'], ['Pedro Martinez / Ramon Martinez BL', 'Los Angeles Dodgers']), '81': (['Roberto Alomar / Sandy Alomar Jr. BL', 'Toronto Blue Jays / Cleveland Indians'], ['Sandy Alomar Jr. / Roberto Alomar BL', 'Cleveland Indians / Toronto Blue Jays']), '82': (['Cal Jr. & Billy BL', 'Baltimore Orioles'], ['Cal Ripken Jr. / Billy Ripken BL', 'Baltimore Orioles']), '83': (['Chris Gwynn / Tony Gwynn BL', 'Los Angeles Dodgers / San Diego Padres'], ['Tony Gwynn / Chris Gwynn BL', 'San Diego Padres / Los Angeles Dodgers']), '84': (['Gary & Dwight BL', 'New York Mets'], ['Dwight Gooden / Gary Sheffield BL', '']), '85': (['Ken Sr., Craig & Ken Jr. BL', 'Seattle Mariners'], ['Ken Griffey Sr. / Craig Griffey / Ken Griffey Jr. BL', 'Seattle Mariners']), '86': (['Jim Abbott CL', 'California Angels'], ['Jim Abbott TC, CL', 'California Angels']), '87': (['Frank Thomas CL', 'Chicago White Sox'], ['Frank Thomas TC, CL', 'Chicago White Sox']), '88': (['Danny Tartabull CL', 'Kansas City Royals'], ['Danny Tartabull TC, CL', 'Kansas City Royals']), '89': (['Scott Erickson CL', 'Minnesota Twins'], ['Scott Erickson TC, CL', 'Minnesota Twins']), '90': (['Rickey Henderson CL', 'Oakland Athletics'], ['Rickey Henderson TC, CL', 'Oakland Athletics']), '91': (['Edgar Martinez CL', 'Seattle Mariners'], ['Edgar Martinez TC, CL', 'Seattle Mariners']), '92': (['Nolan Ryan CL', 'Texas Rangers'], ['Nolan Ryan TC, CL', 'Texas Rangers']), '93': (['Ben McDonald CL', 'Baltimore Orioles'], ['Ben McDonald TC, CL', 'Baltimore Orioles']), '94': (['Ellis Burks CL', 'Boston Red Sox'], ['Ellis Burks TC, CL', 'Boston Red Sox']), '95': (['Greg Swindell CL', 'Cleveland Indians'], ['Greg Swindell TC, CL', 'Cleveland Indians']), '96': (['Cecil Fielder CL', 'Detroit Tigers'], ['Cecil Fielder TC, CL', 'Detroit Tigers']), '97': (['Greg Vaughn CL', 'Milwaukee Brewers'], ['Greg Vaughn TC, CL', 'Milwaukee Brewers']), '98': (['Kevin Maas CL', 'New York Yankees'], ['Kevin Maas TC, CL', 'New York Yankees']), '99': (['Dave Stieb CL', 'Toronto Blue Jays'], ['Dave Stieb TC, CL', 'Toronto Blue Jays']), '312': (['Scott Brosius RC', 'Oakland Athletics'], ['Scott Brosius', 'Oakland Athletics']), '526': (['Frank Castillo RC', 'Chicago Cubs'], ['Frank Castillo', 'Chicago Cubs']), '562': (['Rey Sanchez RC', 'Chicago Cubs'], ['Rey Sanchez', 'Chicago Cubs']), '566': (['Jose Melendez RC', 'San Diego Padres'], ['Jose Melendez', 'San Diego Padres']), '614': (['Chris Beasley RC', 'California Angels'], ['Chris Beasley', 'California Angels']), '621': (['Warren Newson RC', 'Chicago White Sox'], ['Warren Newson', 'Chicago White Sox']), '625': (['Juan Guzman RC', 'Toronto Blue Jays'], ['Juan Guzman', 'Toronto Blue Jays']), '640': (['Diamond Skills Checklist (Rickey Henderson / Jose Canseco) DS, CL', 'Oakland Athletics'], ['Diamond Skills Checklist DS, CL', 'Oakland Athletics']), '664': (['Wayne Housie RC', 'Boston Red Sox'], ['Wayne Housie', 'Boston Red Sox']), '667': (['Bryan Hickerson RC', 'San Francisco Giants'], ['Bryan Hickerson', 'San Francisco Giants']), '674': (['Armando Reynoso RC', 'Atlanta Braves'], ['Armando Reynoso', 'Atlanta Braves']), '701': (['Clemente Nunez RC', 'Florida Marlins'], ['Clemente Nunez', 'Florida Marlins']), '710': (['Ryan Turner RC', 'Colorado Rockies'], ['Ryan Turner', 'Colorado Rockies']), '711': (['Diamond Skills Checklist (Barry Bonds / Andy Van Slyke) DS, CL', 'Pittsburgh Pirates'], ['Diamond Skills Checklist DS, CL', 'Pittsburgh Pirates']), '731': (['Calvin Jones RC', 'Seattle Mariners'], ['Calvin Jones', 'Seattle Mariners']), '752': (['Ruben Amaro Jr.', 'Philadelphia Phillies'], ['Ruben Amaro', 'Philadelphia Phillies']), '757': (['Eddie Taubensee RC', 'Houston Astros'], ['Eddie Taubensee', 'Houston Astros']), '770': (['Diamond Debuts Checklist (Donovan Osborne) DD, CL', 'St. Louis Cardinals'], ['Diamond Debuts Checklist DD, CL', 'St. Louis Cardinals']), '772': (['Archi Cianfrocco DD, RC', 'Montreal Expos'], ['Archi Cianfrocco DD', 'Montreal Expos']), '773': (['Mark Clark DD, RC', 'St. Louis Cardinals'], ['Mark Clark DD', 'St. Louis Cardinals']), '774': (['Chad Curtis DD, RC', 'California Angels'], ['Chad Curtis DD', 'California Angels']), '775': (['Pat Listach DD, RC', 'Milwaukee Brewers'], ['Pat Listach DD', 'Milwaukee Brewers']), '776': (['Pat Mahomes DD, RC', 'Minnesota Twins'], ['Pat Mahomes DD', 'Minnesota Twins']), '778': (['John Patterson DD, RC', 'San Francisco Giants'], ['John Patterson DD', 'San Francisco Giants']), '779': (['Andy Stankiewicz DD, RC', 'New York Yankees'], ['Andy Stankiewicz DD', 'New York Yankees']), '780': (['Turk Wendell DD, RC', 'Chicago Cubs'], ['Turk Wendell DD', 'Chicago Cubs']), '786': (['Matt Stairs RC', 'Montreal Expos'], ['Matt Stairs', 'Montreal Expos']), '794': (['Mike Kelly RC', 'Atlanta Braves'], ['Mike Kelly', 'Atlanta Braves'])}

TAGS = r'(?:RC|LL|AS|SR|TP|TC|CL|BL|DS|DD|SIS|HDR|SP|VAR|UER|ERR|COR|AU|SN\d+)'
TRAILING = re.compile(r'\s+(' + TAGS + r'(?:,?\s+' + TAGS + r')*)$', re.I)

def require(condition, message):
    if not condition:
        raise ValueError(message)

def split_label(label):
    label = ' '.join(label.split())
    match = TRAILING.search(label)
    return (label[:match.start()], set(re.split(r',?\s+',match[1].upper()))) if match else (label,set())

def clean_name(label):
    return split_label(label)[0]

def is_team(value):
    return bool(value) and all(t in KNOWN_CLUBS for t in value.split(' / '))

def is_checklist(player, subset=''):
    return 'checklist' in (player + ' ' + subset).lower()

def fetch(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=35) as response:
            return response.read().decode('utf8','replace')
    except Exception as exc:
        raise RuntimeError(f'Source retrieval failed: {url}: {exc}; no partial output written') from exc

def independent_rows(raw, key):
    section = SECTIONS[key]
    marker = 'id="' + section.replace('&','&amp;') + '"'
    part = raw[raw.index(marker):]
    if key == 'base':
        part = part[:part.index('id="Parallels"')]
    else:
        boundary = re.search(r'<h[234](?:\s|>)', part)
        if boundary:
            part = part[:boundary.start()]
    rows = [html.unescape(re.sub('<[^>]+>','',r)).strip() for r in re.findall('<li>(.*?)</li>',part,re.S)]
    return [r for r in rows if re.match(r'^(?:\d+|SP\d|HH\d|HR\d+|H\d|HI\d+|T\d+|SR\d+|CP\d|AU\d|NNO)\s',r)]

def earlier_bcp(raw, key):
    wanted = ['U-17 Warren Newson RC','U-60 Juan Guzman RC'] if key == 'earlier-bcp-ultra' else ['308 Ted Wood']
    rows = [html.unescape(re.sub('<[^>]+>','',r)).strip() for r in re.findall('<li>(.*?)</li>',raw,re.S)]
    return [r for r in rows if r in wanted]

def ccc_rc(raw, key):
    number,name = ('52','Eduardo Perez') if key == 'ccc-rc-52' else ('796','Butch Henry')
    plain = ' '.join(html.unescape(re.sub('<[^>]+>',' ',raw)).split())
    match = re.search(r'\b'+number+r'\s+'+name+r'\s+(?:Top Prospect\s+)?RC\b',plain)
    require(bool(match),'Independent rookie evidence missing: ' + key)
    return [match[0]]

def refresh_sources(snapshot):
    changed = copy.deepcopy(snapshot)
    urls = {entry['url'].split('#',1)[0] for entry in changed['sources'].values()}
    # Fetch independent URLs concurrently; parse/validate all results before writes.
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as pool:
        cache = dict(zip(sorted(urls),pool.map(fetch,sorted(urls))))
    for key,entry in changed['sources'].items():
        url = entry['url'].split('#',1)[0]
        require('BasicID=' not in url,'Unverified source filter')
        raw = cache[url]
        if key.startswith('bcp-'):
            rows = independent_rows(raw,key.removeprefix('bcp-'))
        elif key.startswith('earlier-bcp-'):
            rows = earlier_bcp(raw,key)
        elif key.startswith('ccc-rc-'):
            rows = ccc_rc(raw,key)
        else:
            rows = parse(raw,expected_sid=int(re.search(r'/sid/(\d+)/',url)[1]))
        entry['records'] = rows
        entry['sha256'] = hashlib.sha256(raw.encode()).hexdigest()
        print(f'Retrieved {key}: {len(rows)} rows',flush=True)
    # Review observations are manual, not regenerated from image pixels.
    for entry in changed.get('reviewedScanEvidence',[]):
        request = urllib.request.Request(entry['url'],headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=35) as response:
            require(hashlib.sha256(response.read()).hexdigest() == entry['sha256'],'Reviewed scan changed: '+entry['url'])
    changed['retrievedAt'] = datetime.now(timezone.utc).date().isoformat()
    return changed

def records(snapshot,key):
    entry = snapshot['sources'][key]
    require(entry['url'].startswith('https://') and re.fullmatch('[a-f0-9]{64}',entry['sha256']), 'Invalid source provenance: '+key)
    return entry['records']

def all_numbered(snapshot,prefix):
    rows = [r for page in range(1,9) for r in records(snapshot,f'{prefix}-{page}')]
    require(len(rows) == 800 and {r[0] for r in rows} == {str(i) for i in range(1,801)},'Incomplete, duplicate or unreviewed '+prefix+' checklist')
    return rows

def rookies(snapshot,base):
    indexed = {n:(clean_name(label),team) for n,label,team,_ in records(snapshot,'rookies-1')}
    canonical = {n:(clean_name(label),team) for n,label,team,_ in base if 'RC' in split_label(label)[1]}
    require(len(records(snapshot,'rookies-1')) == 45 and not records(snapshot,'rookies-2') and set(indexed) == SOURCE_ROOKIES and indexed == canonical,'Canonical/index candidate RC identities or teams changed')
    # Confirm the earlier-release exceptions from independent enumerated records.
    checks = {
        'earlier-final': [('25F','Dave Nilsson'),('7F','Dmitri Young'),('27F','Frank Castillo'),('30F','Chito Martinez')],
        'earlier-donruss': [('23','Jose Melendez')],
        'earlier-fleer1': [('U-86','Mo Sanford')],
    }
    for source,identities in checks.items():
        by_number = {r[0]:r for r in records(snapshot,source)}
        for n,name in identities:
            require(n in by_number and clean_name(by_number[n][1]) == name,'Earlier-release identity failed: '+source+' '+n)
    require(records(snapshot,'earlier-bcp-ultra') == ['U-17 Warren Newson RC','U-60 Juan Guzman RC'],'Earlier Ultra RC evidence changed')
    require(records(snapshot,'earlier-bcp-big') == ['308 Ted Wood'],'Earlier Ted Wood issue changed')
    require(records(snapshot,'ccc-rc-52') == ['52 Eduardo Perez Top Prospect RC'] and records(snapshot,'ccc-rc-796') == ['796 Butch Henry RC'],'Independent RC evidence changed')
    return (SOURCE_ROOKIES - set(EARLIER) - {'54','69'}) | {'52'}

def subset_for(n):
    if n % 100 == 0:
        return 'Checklist'
    if n == 1:
        return 'Star Rookies Checklist'
    if 2 <= n <= 27:
        return 'Star Rookies'
    if n in list(range(29,41)) + list(range(86,100)):
        return 'Team Checklist'
    if n == 51:
        return 'Top Prospects Checklist'
    if 52 <= n <= 77:
        return 'Top Prospects'
    if 79 <= n <= 85:
        return 'Bloodlines'
    if n in [640,711]:
        return 'Diamond Skills Checklist'
    if 641 <= n <= 650 or 712 <= n <= 721:
        return 'Diamond Skills'
    if n == 770:
        return 'Diamond Debuts Checklist'
    if 771 <= n <= 780:
        return 'Diamond Debuts'
    return {28:'400 Home Run Club',41:'Playoff Perfection',78:'Stay in School',702:'Rookie Threats',728:'400 Home Run Club',782:'Grand Theft'}.get(n,'')

def row_for(key,number,label,team,note='',rookie=False):
    name,tags = split_label(label)
    subset = ''
    notes = [note] if note else []
    if key in {'base','gold-hologram'}:
        n = int(number)
        if number in RAW_COMPOSITES[key]:
            require(label == RAW_COMPOSITES[key][number], 'Unreviewed composite/alias source: '+key+' #'+number)
        if n == 69:
            require(team == ('Pittsburgh Pirates' if key == 'base' else 'Welland Pirates'),'Reviewed #69 source changed')
        if n == 84:
            require(team == ('New York Mets' if key == 'base' else ''),'Reviewed #84 source changed')
        subset = subset_for(n)
        if n in COMPOSITES:
            name = COMPOSITES[n]
        if n % 100 == 0:
            name = 'Checklist'
            notes.append(f'Checklist: {n-99}-{n}')
        if n == 28:
            require(set(team.split(' / ')) == {'California Angels','San Diego Padres','New York Yankees'},'Winfield affiliations changed')
            team = 'San Diego Padres / New York Yankees / California Angels'
        if n == 54:
            name = 'David Zancanaro'
        if n == 752:
            name = 'Ruben Amaro Jr.'
        if n == 69:
            team = 'Pittsburgh Pirates'
            if key == 'gold-hologram':
                notes.append('Printed Pittsburgh Pirates affiliation; catalog Welland Pirates team corrected from reverse scan')
        if n == 84:
            team = 'New York Mets / Milwaukee Brewers'
            notes.append('Bloodlines cousins Dwight Gooden / Gary Sheffield; affiliations corroborated by individual base cards 135/234')
        if n in [1,81,83]:
            team = {1:'Cleveland Indians / Atlanta Braves',81:'Cleveland Indians / Toronto Blue Jays',83:'San Diego Padres / Los Angeles Dodgers'}[n]
        if number in EARLIER:
            notes.append('Earlier major issue: '+EARLIER[number]+'; current source RC suffix not retained')
        if n in [54,69,796]:
            notes.append('True RC designation disputed; pending catalog review')
        if key == 'gold-hologram':
            notes.append('Gold reverse authentication hologram; factory-set issue')
    elif key in {'williams-heroes','bench-morgan-heroes'}:
        if number == 'NNO':
            require(name == 'Header Card' and not team,'Unexpected generic Heroes header')
            name = ('Ted Williams' if key == 'williams-heroes' else 'Johnny Bench and Joe Morgan')+' Baseball Heroes Header'
            subset = 'Header'
        elif 'CL' in tags:
            subset = 'Checklist'
    elif key == 'heroes-event' and number == 'H8':
        require(name == 'Header Card','Unexpected event header')
        name = 'Vida Blue / Lou Brock / Rollie Fingers'
        subset = 'Header'
    elif key in {'team-holograms','pennant-holograms'}:
        if name in {'American League','National League'}:
            team = name
        notes.append('Unnumbered hologram; NNO identifier is VCS-only')
    elif key in {'williams-auto','bench-morgan-auto','heroes-event-autos'}:
        serial = '3000' if key == 'heroes-event-autos' else '2500'
        require({'AU','SN'+serial} <= tags,'Unverified autograph/serial: '+label)
        subset = 'Checklist' if 'CL' in tags else ''
        notes.append('Autograph; hand-numbered /'+serial+'; diamond reverse hologram')
    elif key == 'special-prints':
        if number == 'SP4':
            require(name == 'Tom Selleck' and team == 'New York Yankees','SP4 source changed')
            name = 'Tom Selleck / Frank Thomas'
        # Distribution information belongs on the Product Set, not variants.
        notes = [re.split(r';\s*Issued in',n,1)[0] for n in notes]
    elif key == 'williams-hologram':
        notes = ['Hologram']
    if 'SP' in tags:
        notes.append('Short print')
    if rookie:
        name += ' RC'
    require(name and not re.search(r'\b(?:UER|ERR|COR|VAR|HDR|SIS|AU|SN\d+)\b',name),'Dirty subject: '+name)
    require(not team or is_team(team),'Unknown historical affiliation: '+key+' #'+number+' '+team)
    allowed_header = key in {'williams-heroes','bench-morgan-heroes'} and number == 'NNO'
    require(team or is_checklist(name,subset) or allowed_header,'Unexpected missing team: '+key+' #'+number)
    return [key,number,name,team,subset,'; '.join(dict.fromkeys(n for n in notes if n))]

def normalized(name):
    aliases={'Manny Lee':'Manuel Lee','Dave West':'David West','Oil Can Boyd':'Dennis Boyd','Dave Justice':'David Justice','Curt Wilkerson':'Curtis Wilkerson','Pat Mahomes, Sr.':'Pat Mahomes','David Nilsson':'Dave Nilsson','Dave Zancanaro':'David Zancanaro'}
    name=aliases.get(name,name)
    return re.sub('[^a-z0-9]','',name.lower())

def same_people(a,b):
    return sorted(normalized(n.strip()) for n in a.split(' / ')) == sorted(normalized(n.strip()) for n in b.split(' / '))

def independent_subject(raw):
    return re.split(r'\s+(?:UER|ERR|COR|SR|TP|DD|RC|CL|SP|NLCS)\b|\s+["“]|\s+400\s+HR',raw,maxsplit=1)[0].strip()

def verify_independent(snapshot,cards):
    by_key={key:{r[1]:r for r in cards if r[0]==key} for key in EXPECTED}
    for key in SECTIONS:
        rows=records(snapshot,'bcp-'+key)
        require(len(rows)==(2 if key=='heroes-autos' else len(EXPECTED[key])),'Independent checklist count: '+key)
        for raw in rows:
            number,subject=raw.split(' ',1)
            if key=='heroes-autos':
                family,n={'AU4':('williams-auto','36'),'AU5':('bench-morgan-auto','45')}[number]
                require(same_people(subject,by_key[family][n][2]),'Autograph subject mismatch')
                continue
            if key=='heroes-event-autos':
                number={'AU5':'H5','AU6':'H6','AU7':'H7'}[number]
            actual=by_key[key][number]
            candidate=independent_subject(subject)
            if key=='base' and number=='80':
                require(candidate=='Kevin Mitchell / Brian Mitchell','BCP documented #80 error changed')
                candidate='Kevin Mitchell / Keith Mitchell'
            if key=='base' and int(number)%100==0:
                require(actual[2]=='Checklist' and candidate.startswith('Checklist'),'Generic checklist subject changed')
            elif number=='NNO' and key in {'williams-heroes','bench-morgan-heroes'}:
                require(candidate=='Header','Unrecognized independent header')
            else:
                require(same_people(candidate,actual[2].removesuffix(' RC')),f'Independent identity mismatch {key} #{number}: {candidate!r} vs {actual[2]!r}')
    for n,row in by_key['gold-hologram'].items():
        base=by_key['base'][n]
        require(row[2]==base[2].removesuffix(' RC') and row[3:5]==base[3:5],'Gold/base identity/team/subset mismatch #'+n)
    bcp_rc={r.split(' ',1)[0] for r in records(snapshot,'bcp-base') if re.search(r'\bRC\b',r)}
    require(SOURCE_ROOKIES-bcp_rc=={'12','45','57','58','526','566','621'} and bcp_rc-SOURCE_ROOKIES=={'52','672','796'},'BCP/TCDB RC discrepancies changed')
    # Logos have no printed card numbers: verify full franchise inventory instead.
    for key,subjects in [('pennant-holograms',FRANCHISES),('team-holograms',FRANCHISES|{'American League','National League'})]:
        require({r[2] for r in by_key[key].values()}==subjects,'Incomplete logo subjects: '+key)

def validate(bundle,cards):
    require(bundle['schemaVersion']==2 and bundle['status']=='DRAFT' and bundle['product']['released'] is False,'Must remain an unreleased draft')
    require(bundle['product']['cardsPerPack']==15 and bundle['product']['packsPerBox']==36,'Physical pack model changed')
    require(bundle['review']['teamData']=='PENDING' and bundle['review']['rookieDesignation'].startswith('PENDING'),'Review gates cannot be bypassed')
    specs=bundle['productSets']
    require(len(specs)==len(EXPECTED)==len({s['id'] for s in specs})==17 and {s['key'] for s in specs}==set(EXPECTED),'Wrong collector-set inventory')
    require(len(cards)==len({(r[0],r[1]) for r in cards})==1774,'Expected 1774 distinct explicit cards')
    for spec in specs:
        key=spec['key'];rows=[r for r in cards if r[0]==key]
        require(spec['expectedCards']==len(EXPECTED[key])==len(rows) and {r[1] for r in rows}==EXPECTED[key],'Missing or duplicate card numbers: '+key)
        require(spec.get('oddsPerPack') is None,'Unverified or manufactured pack odds: '+key)
        require(spec['kind']==('BASE' if key=='base' else 'PARALLEL' if key=='gold-hologram' else 'INSERT'),'Wrong collector-set kind')
    expected_rc=(SOURCE_ROOKIES-set(EARLIER)-{'54','69'})|{'52'}
    require(len(expected_rc)==36 and {r[1] for r in cards if r[0]=='base' and r[2].endswith(' RC')}==expected_rc,'Retained rookie designation audit failed')
    require(sum(r[2].endswith(' RC') for r in cards)==36,'RC inferred on parallel/insert')
    blank={(key,str(n)) for key in ['base','gold-hologram'] for n in range(100,801,100)}|{('williams-heroes','NNO'),('bench-morgan-heroes','NNO')}
    require({(r[0],r[1]) for r in cards if not r[3]}==blank,'Unexpected missing teams')
    base={r[1]:r for r in cards if r[0]=='base'}
    for n,name,team in [('3','Brian Jordan RC','St. Louis Cardinals'),('12','Ted Wood','San Francisco Giants'),('52','Eduardo Perez RC','California Angels'),('54','David Zancanaro','Oakland Athletics'),('57','Dave Nilsson','Milwaukee Brewers'),('63','Manny Ramirez RC','Cleveland Indians'),('69','Jon Farrell','Pittsburgh Pirates'),('80','Keith Mitchell / Kevin Mitchell','Atlanta Braves / San Francisco Giants'),('84','Dwight Gooden / Gary Sheffield','New York Mets / Milwaukee Brewers'),('796','Butch Henry','Houston Astros')]:
        require(base[n][2:4]==[name,team],'Identity/team/RC anchor failed #'+n)
    for row in cards:
        if row[0] in {'base','gold-hologram'} and row[1] in EARLIER:
            require(EARLIER[row[1]] in row[5], 'Earlier-issue metadata missing')
        require(len(row)==6 and all(isinstance(v,str) for v in row),'Invalid six-column CSV row')
        require(not row[3] or is_team(row[3]),'Invalid team')
        require(not re.search(r'\b1\s*:\s*\d+|Issued in .*packs',row[5]),'Set distribution leaked into variant')

def assemble(bundle,snapshot):
    require(snapshot['schemaVersion']==1,'Invalid source schema')
    base=all_numbered(snapshot,'base')
    gold=all_numbered(snapshot,'gold')
    # Exact raw identity/affiliation differences are reviewed, never skipped.
    actual_differences={a[0]:(a[1:3],z[1:3]) for a,z in zip(base,gold) if a[1:3]!=z[1:3]}
    require(actual_differences==RAW_GOLD_DIFFERENCES,'Unreviewed Gold/base source difference')
    rc=rookies(snapshot,base)
    singles={r[0]:r for r in records(snapshot,'singles')}
    require(set(singles)=={'SP3','SP4','HH2'},'Incomplete or unreviewed single inserts')
    cards=[]
    for spec in bundle['productSets']:
        key=spec['key']
        raw=base if key=='base' else gold if key=='gold-hologram' else [singles['SP3'],singles['SP4']] if key=='special-prints' else [singles['HH2']] if key=='williams-hologram' else records(snapshot,key)
        if key in {'team-holograms','pennant-holograms'}:
            raw=sorted(raw,key=lambda r:clean_name(r[1]).casefold())
        for index,(number,label,team,note) in enumerate(raw,1):
            if key in {'team-holograms','pennant-holograms'}:
                require(number=='NNO','Unexpected printed logo number')
                number=f'NNO-{index:02d}'
            cards.append(row_for(key,number,label,team,note,key=='base' and number in rc))
    validate(bundle,cards)
    verify_independent(snapshot,cards)
    return cards

def self_test(bundle,snapshot):
    fixture='<table><tr><td><a href="/ViewCard.cfm/sid/217/cid/1">8</a></td><td>Kyle Abbott UER, SR<br><figcaption>Birthplace error</figcaption></td><td>California Angels</td></tr></table>'
    require(parse(fixture,expected_sid=217)==[['8','Kyle Abbott UER, SR','California Angels','Birthplace error']],'Caption parser regression')
    try:parse(fixture.replace('/sid/217/','/sid/171/'),expected_sid=217)
    except ValueError:pass
    else:raise ValueError('Wrong card-set namespace accepted')
    for raw,wanted in [('Ken Boswell','Ken Boswell'),('Ken Boswell LL','Ken Boswell'),('John Marshall','John Marshall'),('Jim Hall CL','Jim Hall'),('Kyle Abbott UER, SR','Kyle Abbott'),('Dave Stieb CL','Dave Stieb')]:
        require(clean_name(raw)==wanted,'Whole-token name boundary failed: '+raw)
    assemble(bundle,snapshot)
    cases=[
        ('missing base',lambda s:s['sources']['base-1']['records'].pop()),
        ('wrong player',lambda s:s['sources']['base-2']['records'][0].__setitem__(1,'Wrong Player')),
        ('wrong team',lambda s:s['sources']['base-2']['records'][0].__setitem__(2,'Boston Red Sox')),
        ('blank team',lambda s:s['sources']['base-2']['records'][0].__setitem__(2,'')),
        ('bad candidate RC',lambda s:s['sources']['rookies-1']['records'][0].__setitem__(1,'Jim Thome RC')),
        ('missing Gold',lambda s:s['sources']['gold-1']['records'].pop()),
        ('wrong Gold player',lambda s:s['sources']['gold-3']['records'][0].__setitem__(1,'Wrong Player')),
        ('missing insert',lambda s:s['sources']['williams-best']['records'].pop()),
        ('wrong autograph serial',lambda s:s['sources']['williams-auto']['records'][0].__setitem__(1,'Ted Williams AU, SN100')),
        ('missing logo',lambda s:s['sources']['team-holograms']['records'].pop()),
        ('changed earlier RC',lambda s:s['sources']['earlier-final']['records'][24].__setitem__(1,'Wrong Player')),
    ]
    for name,mutate in cases:
        changed=copy.deepcopy(snapshot);mutate(changed)
        try:assemble(bundle,changed)
        except (ValueError,KeyError):pass
        else:raise ValueError('Corruption was accepted: '+name)
    print('PASS: full checklist audit, parser, source namespace, token boundaries and eleven corruption tests')


def csv_text(cards):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(HEADER)
    writer.writerows(cards)
    return stream.getvalue()


def atomic_write(path, text):
    temporary = path.with_suffix(path.suffix + '.tmp')
    try:
        temporary.write_text(text, encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--refresh-sources', action='store_true')
    args = parser.parse_args()
    bundle = json.loads(BUNDLE.read_text())
    snapshot = json.loads(SOURCE.read_text())
    if args.refresh_sources:
        snapshot = refresh_sources(snapshot)
    self_test(bundle, snapshot)
    cards = assemble(bundle, snapshot)
    text = csv_text(cards)
    if args.check:
        require(OUT.read_text() == text, 'Committed CSV differs from verified regeneration')
    elif not args.self_test:
        if args.refresh_sources:
            atomic_write(SOURCE, json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')
        atomic_write(OUT, text)
    print(f'PASS: {len(cards)} checklist-validated cards / {len(bundle["productSets"])} collector sets / 36 retained base RCs; 3 explicit designation disputes; released=false')
    for spec in bundle['productSets']:
        print(f"  {spec['key']}: {spec['expectedCards']}")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'FAIL CLOSED: {exc}; no partial checklist written', file=sys.stderr)
        sys.exit(1)
