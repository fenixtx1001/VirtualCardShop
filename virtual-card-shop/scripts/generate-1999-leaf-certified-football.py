from pathlib import Path
from collections import Counter
import csv
import json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "set-factory"
OUT = DATA / "1999-leaf-certified-football.cards.csv"
BUNDLE = DATA / "1999-leaf-certified-football.bundle.json"

base_text = r'''1|Simeon Rice|Arizona Cardinals
2|Frank Sanders|Arizona Cardinals
3|Andre Wadsworth|Arizona Cardinals
4|Larry Centers|Arizona Cardinals
5|Byron Hanspard|Atlanta Falcons
6|Terance Mathis|Atlanta Falcons
7|O.J. Santiago|Atlanta Falcons
8|Chris Calloway|Atlanta Falcons
9|Michael Jackson|Baltimore Ravens
10|Rod Woodson|Baltimore Ravens
11|Pat Johnson|Baltimore Ravens
12|Rob Johnson|Buffalo Bills
13|Andre Reed|Buffalo Bills
14|Tim Biakabutuka|Carolina Panthers
15|Rae Carruth|Carolina Panthers
16|Fred Lane|Carolina Panthers
17|Muhsin Muhammad|Carolina Panthers
18|Wesley Walls|Carolina Panthers
19|Edgar Bennett|Chicago Bears
20|Curtis Conway|Chicago Bears
21|Bobby Engram|Chicago Bears
22|Jeff Blake|Cincinnati Bengals
23|Darnay Scott|Cincinnati Bengals
24|Ty Detmer|Cleveland Browns
25|Sedrick Shaw|Cleveland Browns
26|Leslie Shepherd|Cleveland Browns
27|Terry Kirby|Cleveland Browns
28|Chris Warren|Dallas Cowboys
29|Raghib Ismail|Dallas Cowboys
30|Marcus Nash|Denver Broncos
31|Neil Smith|Denver Broncos
32|Bubby Brister|Denver Broncos
33|Brian Griese|Denver Broncos
34|Germane Crowell|Detroit Lions
35|Johnnie Morton|Detroit Lions
36|Gus Frerotte|Detroit Lions
37|Robert Brooks|Green Bay Packers
38|Mark Chmura|Green Bay Packers
39|Derrick Mayes|Green Bay Packers
40|Jerome Pathon|Indianapolis Colts
41|Jimmy Smith|Jacksonville Jaguars
42|James Stewart|Jacksonville Jaguars
43|Tavian Banks|Jacksonville Jaguars
44|Derrick Alexander|Kansas City Chiefs
45|Kimble Anders|Kansas City Chiefs
46|Elvis Grbac|Kansas City Chiefs
47|Derrick Thomas|Kansas City Chiefs
48|Bam Morris|Kansas City Chiefs
49|Tony Gonzalez|Kansas City Chiefs
50|John Avery|Miami Dolphins
51|Tyrone Wheatley|Miami Dolphins
52|Zach Thomas|Miami Dolphins
53|Lamar Thomas|Miami Dolphins
54|Jeff George|Minnesota Vikings
55|John Randle|Minnesota Vikings
56|Jake Reed|Minnesota Vikings
57|Leroy Hoard|Minnesota Vikings
58|Robert Edwards|New England Patriots
59|Ben Coates|New England Patriots
60|Tony Simmons|New England Patriots
61|Shawn Jefferson|New England Patriots
62|Eddie Kennison|New Orleans Saints
63|Lamar Smith|New Orleans Saints
64|Tiki Barber|New York Giants
65|Kerry Collins|New York Giants
66|Ike Hilliard|New York Giants
67|Gary Brown|New York Giants
68|Joe Jurevicius|New York Giants
69|Kent Graham|New York Giants
70|Dedric Ward|New York Jets
71|Terry Allen|Washington Redskins
72|Neil O'Donnell|Cincinnati Bengals
73|Desmond Howard|Green Bay Packers
74|James Jett|Oakland Raiders
75|Jon Ritchie|Oakland Raiders
76|Rickey Dudley|Oakland Raiders
77|Charles Johnson|Philadelphia Eagles
78|Chris Fuamatu-Ma'afala|Pittsburgh Steelers
79|Hines Ward|Pittsburgh Steelers
80|Ryan Leaf|San Diego Chargers
81|Jim Harbaugh|San Diego Chargers
82|Junior Seau|San Diego Chargers
83|Mikhael Ricks|San Diego Chargers
84|J.J. Stokes|San Francisco 49ers
85|Ahman Green|Seattle Seahawks
86|Tony Banks|Baltimore Ravens
87|Robert Holcombe|St. Louis Rams
88|Az-Zahir Hakim|St. Louis Rams
89|Greg Hill|St. Louis Rams
90|Trent Green|St. Louis Rams
91|Eric Zeier|Tampa Bay Buccaneers
92|Reidel Anthony|Tampa Bay Buccaneers
93|Bert Emanuel|Tampa Bay Buccaneers
94|Warren Sapp|Tampa Bay Buccaneers
95|Kevin Dyson|Tennessee Titans
96|Yancey Thigpen|Tennessee Titans
97|Frank Wycheck|Tennessee Titans
98|Michael Westbrook|Washington Redskins
99|Albert Connell|Washington Redskins
100|Darrell Green|Washington Redskins
101|Rob Moore|Arizona Cardinals
102|Adrian Murrell|Arizona Cardinals
103|Jake Plummer|Arizona Cardinals
104|Chris Chandler|Atlanta Falcons
105|Jamal Anderson|Atlanta Falcons
106|Tim Dwight|Atlanta Falcons
107|Jermaine Lewis|Baltimore Ravens
108|Priest Holmes|Baltimore Ravens
109|Bruce Smith|Buffalo Bills
110|Eric Moulds|Buffalo Bills
111|Antowain Smith|Buffalo Bills
112|Curtis Enis|Chicago Bears
113|Corey Dillon|Cincinnati Bengals
114|Michael Irvin|Dallas Cowboys
115|Ed McCaffrey|Denver Broncos
116|Shannon Sharpe|Denver Broncos
117|Terrell Davis|Denver Broncos
118|Charlie Batch|Detroit Lions
119|Antonio Freeman|Green Bay Packers
120|Dorsey Levens|Green Bay Packers
121|Marvin Harrison|Indianapolis Colts
122|Peyton Manning|Indianapolis Colts
123|Keenan McCardell|Jacksonville Jaguars
124|Fred Taylor|Jacksonville Jaguars
125|Andre Rison|Kansas City Chiefs
126|O.J. McDuffie|Miami Dolphins
127|Karim Abdul-Jabbar|Miami Dolphins
128|Randy Moss|Minnesota Vikings
129|Terry Glenn|New England Patriots
130|Vinny Testaverde|New York Jets
131|Keyshawn Johnson|New York Jets
132|Curtis Martin|New York Jets
133|Wayne Chrebet|New York Jets
134|Napoleon Kaufman|Oakland Raiders
135|Charles Woodson|Oakland Raiders
136|Duce Staley|Philadelphia Eagles
137|Kordell Stewart|Pittsburgh Steelers
138|Terrell Owens|San Francisco 49ers
139|Ricky Watters|Seattle Seahawks
140|Joey Galloway|Seattle Seahawks
141|Jon Kitna|Seattle Seahawks
142|Isaac Bruce|St. Louis Rams
143|Jacquez Green|Tampa Bay Buccaneers
144|Warrick Dunn|Tampa Bay Buccaneers
145|Mike Alstott|Tampa Bay Buccaneers
146|Trent Dilfer|Tampa Bay Buccaneers
147|Steve McNair|Tennessee Titans
148|Eddie George|Tennessee Titans
149|Skip Hicks|Washington Redskins
150|Brad Johnson|Washington Redskins
151|Doug Flutie|Buffalo Bills
152|Thurman Thomas|Buffalo Bills
153|Carl Pickens|Cincinnati Bengals
154|Emmitt Smith|Dallas Cowboys
155|Troy Aikman|Dallas Cowboys
156|Deion Sanders|Dallas Cowboys
157|John Elway|Denver Broncos
158|Rod Smith|Denver Broncos
159|Barry Sanders|Detroit Lions
160|Herman Moore|Detroit Lions
161|Brett Favre|Green Bay Packers
162|Mark Brunell|Jacksonville Jaguars
163|Warren Moon|Kansas City Chiefs
164|Dan Marino|Miami Dolphins
165|Randall Cunningham|Minnesota Vikings
166|Robert Smith|Minnesota Vikings
167|Cris Carter|Minnesota Vikings
168|Drew Bledsoe|New England Patriots
169|Tim Brown|Oakland Raiders
170|Jerome Bettis|Pittsburgh Steelers
171|Natrone Means|San Diego Chargers
172|Jerry Rice|San Francisco 49ers
173|Steve Young|San Francisco 49ers
174|Garrison Hearst|San Francisco 49ers
175|Marshall Faulk|St. Louis Rams
176|David Boston|Arizona Cardinals
177|Jeff Paulk|Atlanta Falcons
178|Reginald Kelly|Atlanta Falcons
179|Scott Covington|Cincinnati Bengals
180|Chris McAlister|Baltimore Ravens
181|Shawn Bryson|Buffalo Bills
182|Peerless Price|Buffalo Bills
183|Cade McNown|Chicago Bears
184|Michael Bishop|New England Patriots
185|D'Wayne Bates|Chicago Bears
186|Marty Booker|Chicago Bears
187|Akili Smith|Cincinnati Bengals
188|Craig Yeast|Cincinnati Bengals
189|Tim Couch|Cleveland Browns
190|Kevin Johnson|Cleveland Browns
191|Wane McGarity|Dallas Cowboys
192|Olandis Gary|Denver Broncos
193|Travis McGriff|Denver Broncos
194|Sedrick Irvin|Detroit Lions
195|Chris Claiborne|Detroit Lions
196|De'Mond Parker|Green Bay Packers
197|Dee Miller|Green Bay Packers
198|Edgerrin James|Indianapolis Colts
199|Mike Cloud|Kansas City Chiefs
200|Larry Parker|Kansas City Chiefs
201|Cecil Collins|Miami Dolphins
202|James Johnson|Miami Dolphins
203|Rob Konrad|Miami Dolphins
204|Daunte Culpepper|Minnesota Vikings
205|Jim Kleinsasser|Minnesota Vikings
206|Kevin Faulk|New England Patriots
207|Andy Katzenmoyer|New England Patriots
208|Ricky Williams|New Orleans Saints
209|Joe Montgomery|New York Giants
210|Sean Bennett|New York Giants
211|Dameane Douglas|Oakland Raiders
212|Donovan McNabb|Philadelphia Eagles
213|Na Brown|Philadelphia Eagles
214|Amos Zereoue|Pittsburgh Steelers
215|Troy Edwards|Pittsburgh Steelers
216|Jermaine Fazande|San Diego Chargers
217|Tai Streets|San Francisco 49ers
218|Brock Huard|Seattle Seahawks
219|Charlie Rogers|Seattle Seahawks
220|Karsten Bailey|Seattle Seahawks
221|Joe Germaine|St. Louis Rams
222|Torry Holt|St. Louis Rams
223|Shaun King|Tampa Bay Buccaneers
224|Jevon Kearse|Tennessee Titans
225|Champ Bailey|Washington Redskins'''

base = []
for line in base_text.splitlines():
    number, player, team = line.split('|', 2)
    base.append((int(number), player, team))

team_by_player = {player: team for _, player, team in base}
team_by_player.update({
    'Jim Kelly': 'Buffalo Bills',
    'Phil Simms': 'New York Giants',
    'Joe Montana': 'San Francisco 49ers',
    'Tony Boselli': 'Jacksonville Jaguars',
    'Chris Sanders': 'Tennessee Titans',
})

gold_future = '''Travis McGriff
Jermaine Fazande
Kevin Faulk
Edgerrin James
Ricky Williams
Tim Couch
Torry Holt
Kevin Johnson
Amos Zereoue
Joe Germaine
Shawn Bryson
D'Wayne Bates
Akili Smith
Shaun King
Joe Montgomery
Troy Edwards
Rob Konrad
David Boston
Reginald Kelly
Donovan McNabb
Champ Bailey
Craig Yeast
Daunte Culpepper
Peerless Price
Cecil Collins
Cade McNown
Karsten Bailey
James Johnson
Brock Huard
Mike Cloud'''.splitlines()

gold_team = '''Randy Moss
Terrell Davis
Peyton Manning
Fred Taylor
Jake Plummer
Drew Bledsoe
John Elway
Mark Brunell
Joey Galloway
Troy Aikman
Jerome Bettis
Tim Brown
Dan Marino
Antonio Freeman
Steve Young
Jamal Anderson
Brett Favre
Jerry Rice
Corey Dillon
Barry Sanders
Doug Flutie
Emmitt Smith
Curtis Martin
Dorsey Levens
Kordell Stewart
Eddie George
Terrell Owens
Keyshawn Johnson
Steve McNair
Cris Carter'''.splitlines()

skills = [
('CS-1','Deion Sanders','Champ Bailey'),('CS-2','John Elway','Cade McNown'),('CS-3','Cris Carter','David Boston'),('CS-4','Marshall Faulk','Edgerrin James'),('CS-5','Jerry Rice','Randy Moss'),('CS-6','Antonio Freeman','Terrell Owens'),('CS-7','Terrell Davis','Ricky Williams'),('CS-8','Drew Bledsoe','Doug Flutie'),('CS-9','Eddie George','Jamal Anderson'),('CS-10','Troy Aikman','Peyton Manning'),('CS-11','Barry Sanders','Warrick Dunn'),('CS-12','Randall Cunningham','Daunte Culpepper'),('CS-13','Dan Marino','Tim Couch'),('CS-14','Emmitt Smith','Fred Taylor'),('CS-15','Keyshawn Johnson','Eric Moulds'),('CS-16','Steve Young','Mark Brunell'),('CS-17','Donovan McNabb','Akili Smith'),('CS-18','Brett Favre','Jake Plummer'),('CS-19','Kordell Stewart','Steve McNair'),('CS-20','Torry Holt','Troy Edwards'),
]

fabric = '''John Elway
Barry Sanders
Jerry Rice
Brett Favre
Steve Young
Troy Aikman
Deion Sanders
Terrell Davis
Mark Brunell
Drew Bledsoe
Randall Cunningham
Eddie George
Jamal Anderson
Doug Flutie
Robert Smith
Garrison Hearst
Keyshawn Johnson
Randy Moss
Eric Moulds
Curtis Enis
Ricky Williams
Peyton Manning
Tim Couch
Cade McNown
Akili Smith
Dan Marino
Jerry Rice
Emmitt Smith
Cris Carter
Steve Young
Herman Moore
Tim Brown
Jerome Bettis
Natrone Means
Antonio Freeman
Terrell Davis
Carl Pickens
Karim Abdul-Jabbar
Mike Alstott
Jake Plummer
Steve McNair
Terrell Owens
Kordell Stewart
Randy Moss
Fred Taylor
Peyton Manning
Tim Couch
Akili Smith
Torry Holt
Donovan McNabb
Barry Sanders
Dan Marino
Jerry Rice
John Elway
Brett Favre
Emmitt Smith
Mark Brunell
Jake Plummer
Ricky Watters
Dorsey Levens
Curtis Martin
Marshall Faulk
Eddie George
Corey Dillon
Warrick Dunn
Antowain Smith
Napoleon Kaufman
Joey Galloway
Fred Taylor
Charlie Batch
Ricky Williams
Edgerrin James
Jon Kitna
Daunte Culpepper
Skip Hicks'''.splitlines()

gridiron = [
('WM1','Warren Moon',''),('BF4-A','Brett Favre','Away White'),('BF4-H','Brett Favre','Home Green'),('DF7-A','Doug Flutie','Away White'),('DF7-H','Doug Flutie','Home Blue'),('JE7-H','John Elway','Home Navy'),('JE7-HC','John Elway','Home Orange'),('RC7','Randall Cunningham',''),('MB8-A','Mark Brunell','Away White'),('MB8-H','Mark Brunell','Home Teal'),('SY8','Steve Young',''),('TA8','Troy Aikman',''),('SM9','Steve McNair',''),('KS10','Kordell Stewart',''),('DB11','Drew Bledsoe',''),('JK12','Jim Kelly',''),('PS12','Phil Simms',''),('TD12','Trent Dilfer',''),('VT12','Vinny Testaverde',''),('DM13-A','Dan Marino','Away White'),('DM13-H','Dan Marino','Home Teal'),('JP16','Jake Plummer',''),('RL16','Ryan Leaf',''),('PM18','Peyton Manning',''),('JM19','Joe Montana',''),('KJ19','Keyshawn Johnson',''),('BS20','Barry Sanders',''),('NM20','Natrone Means',''),('DS21','Deion Sanders',''),('ES22','Emmitt Smith',''),('CW24','Charles Woodson',''),('DL25-A','Dorsey Levens','Away White'),('DL25-H','Dorsey Levens','Home Green'),('NK26-A','Napoleon Kaufman','Away White'),('NK26-H','Napoleon Kaufman','Home Black'),('EG27','Eddie George',''),('CM28','Curtis Martin',''),('DG28','Darrell Green',''),('WD28','Warrick Dunn',''),('TD30-A','Terrell Davis','Away White'),('TD30-H','Terrell Davis','Home'),('JA32','Jamal Anderson',''),('JS33','James Stewart',''),('KA33','Karim Abdul-Jabbar',''),('TT34','Thurman Thomas',''),('JB36','Jerome Bettis',''),('ZT54','Zach Thomas',''),('JS55','Junior Seau',''),('DT58','Derrick Thomas',''),('TB71','Tony Boselli',''),('CC80','Curtis Conway',''),('DH80','Desmond Howard',''),('IB80','Isaac Bruce',''),('JR80-A','Jerry Rice','Away White'),('JR80-H','Jerry Rice','Home Red'),('CS81','Chris Sanders',''),('OM81','O.J. McDuffie',''),('TB81','Tim Brown',''),('JJ82','James Jett',''),('JS82','Jimmy Smith',''),('HM84','Herman Moore',''),('RM84-A','Randy Moss','Away White'),('RM84-H','Randy Moss','Home Purple'),('AF86','Antonio Freeman',''),('BC87','Ben Coates',''),('KM87','Keenan McCardell',''),('RB87','Robert Brooks',''),('MH88','Marvin Harrison',''),('MI88','Michael Irvin',''),('MC89','Mark Chmura',''),('NS90','Neil Smith',''),('WS99','Warren Sapp',''),
]

rows = []
for n, player, team in base:
    if n <= 100:
        subset, variant = '', '1 Star; 4 per pack'
    elif n <= 150:
        subset, variant = '', '2 Stars; 1 per pack'
    elif n <= 175:
        subset, variant = '', '3 Stars; 1:3 packs'
    else:
        subset, variant = 'Rookie', '4 Stars; RC; 1:5 packs'
    rows.append(['base', str(n), player, team, subset, variant])

for i, player in enumerate(gold_future, 1):
    rows.append(['certified-gold-future', str(i), player, team_by_player[player], '', 'Inserted 1:17 packs'])

for i, player in enumerate(gold_team, 1):
    rows.append(['certified-gold-team', f'CGT{i}', player, team_by_player[player], '', 'Inserted 1:17 packs'])

for number, p1, p2 in skills:
    rows.append(['certified-skills', number, f'{p1} / {p2}', f'{team_by_player[p1]} / {team_by_player[p2]}', '', 'Inserted 1:35 packs'])

def fabric_sn(i):
    pos = ((i - 1) % 25) + 1
    if pos <= 3: return 100
    if pos <= 7: return 250
    if pos <= 12: return 500
    if pos <= 18: return 750
    return 1000

def fabric_subset(i):
    if i <= 25: return 'Pro-Bowl Appearances (Nylon)'
    if i <= 50: return 'Career Touchdowns (Leather)'
    return 'Career Yards (Plastic)'

for i, player in enumerate(fabric, 1):
    rows.append(['fabric-of-the-game', f'FG{i}', player, team_by_player[player], fabric_subset(i), f'MEM; SN{fabric_sn(i)}'])

for number, player, color in gridiron:
    variant = 'MEM Jersey; SN300' + (f'; {color}' if color else '')
    rows.append(['gridiron-gear', number, player, team_by_player[player], '', variant])

for n, player, team in base:
    sn = 45 if n <= 100 else 35 if n <= 150 else 25 if n <= 175 else 30
    rows.append(['mirror-gold', str(n), player, team, 'Rookie' if n >= 176 else '', f'Mirror Gold; SN{sn}'])

expected_explicit = {
    'base': 225,
    'certified-gold-future': 30,
    'certified-gold-team': 30,
    'certified-skills': 20,
    'fabric-of-the-game': 75,
    'gridiron-gear': 72,
    'mirror-gold': 225,
}
counts = Counter(row[0] for row in rows)
if counts != Counter(expected_explicit):
    raise SystemExit(f'Explicit count mismatch: {counts}')
if len(rows) != 677:
    raise SystemExit(f'Expected 677 explicit rows, found {len(rows)}')

for key in expected_explicit:
    nums = [row[1] for row in rows if row[0] == key]
    if len(nums) != len(set(nums)):
        raise SystemExit(f'Duplicate card number in {key}')

missing_teams = [row for row in rows if not row[3].strip()]
if missing_teams:
    raise SystemExit(f'Found {len(missing_teams)} rows without teams')

bundle = json.loads(BUNDLE.read_text(encoding='utf-8'))
expected_total = sum(int(ps['expectedCards']) for ps in bundle['productSets'])
if expected_total != 1054:
    raise SystemExit(f'Bundle should resolve 1054 cards, found expected total {expected_total}')

with OUT.open('w', encoding='utf-8', newline='') as fh:
    writer = csv.writer(fh, lineterminator='\n')
    writer.writerow(['setKey','cardNumber','player','team','subset','variant'])
    writer.writerows(rows)

print('=== 1999 LEAF CERTIFIED FOOTBALL CHECKLIST GENERATED ===')
print(f'Created: {OUT.name}')
print(f'Explicit CSV rows: {len(rows)}')
for key, expected in expected_explicit.items():
    print(f'  {key}: {counts[key]}')
print('Derived rows expected from bundle: 377')
print(f'Total resolved cards expected: {expected_total}')
print('Team data: COMPLETE')
