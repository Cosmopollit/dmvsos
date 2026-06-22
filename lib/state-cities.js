// Major-metro DMV office cities per state — used to add genuinely state-
// specific content to each state landing page (Google flags near-duplicate
// templates with only state-name swaps). City names are public, stable, and
// unique per state, so this is a clean way to make 50 pages 50× different.
//
// 20-30 cities per state: every recognizable metro that has a DMV / state-
// agency office, plus the biggest suburbs. Long-tail SEO target — queries
// like "DMV in Pompano Beach" or "DMV office Spring TX" land here.

export const STATE_CITIES = {
  alabama: [
    'Birmingham', 'Montgomery', 'Mobile', 'Huntsville', 'Tuscaloosa',
    'Hoover', 'Dothan', 'Auburn', 'Decatur', 'Madison',
    'Florence', 'Gadsden', 'Vestavia Hills', 'Prattville', 'Phenix City',
    'Anniston', 'Bessemer', 'Opelika', 'Pelham', 'Alabaster',
  ],
  alaska: [
    'Anchorage', 'Fairbanks', 'Juneau', 'Wasilla', 'Sitka',
    'Ketchikan', 'Kenai', 'Kodiak', 'Bethel', 'Palmer',
    'Homer', 'Soldotna', 'Valdez', 'Nome', 'Barrow',
  ],
  arizona: [
    'Phoenix', 'Tucson', 'Mesa', 'Scottsdale', 'Flagstaff',
    'Chandler', 'Glendale', 'Tempe', 'Gilbert', 'Peoria',
    'Surprise', 'Yuma', 'Goodyear', 'Lake Havasu City', 'Avondale',
    'Buckeye', 'Casa Grande', 'Maricopa', 'Prescott', 'Bullhead City',
    'Sierra Vista', 'Apache Junction', 'Marana', 'Oro Valley', 'Sedona',
  ],
  arkansas: [
    'Little Rock', 'Fayetteville', 'Fort Smith', 'Springdale', 'Jonesboro',
    'Rogers', 'Conway', 'North Little Rock', 'Bentonville', 'Pine Bluff',
    'Hot Springs', 'Benton', 'Sherwood', 'Texarkana', 'Russellville',
    'Bella Vista', 'Jacksonville', 'Paragould', 'West Memphis', 'Searcy',
  ],
  california: [
    'Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno',
    'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim', 'Santa Ana',
    'Riverside', 'Stockton', 'Irvine', 'Chula Vista', 'Fremont',
    'San Bernardino', 'Modesto', 'Fontana', 'Oxnard', 'Glendale',
    'Huntington Beach', 'Santa Clarita', 'Garden Grove', 'Santa Rosa', 'Oceanside',
    'Ontario', 'Elk Grove', 'Pomona', 'Berkeley', 'Pasadena',
    'Concord', 'Sunnyvale', 'Fairfield', 'Roseville', 'Palmdale',
  ],
  colorado: [
    'Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Boulder',
    'Lakewood', 'Thornton', 'Arvada', 'Westminster', 'Pueblo',
    'Centennial', 'Greeley', 'Longmont', 'Loveland', 'Broomfield',
    'Grand Junction', 'Castle Rock', 'Commerce City', 'Parker', 'Littleton',
  ],
  connecticut: [
    'Hartford', 'New Haven', 'Stamford', 'Bridgeport', 'Waterbury',
    'Norwalk', 'Danbury', 'New Britain', 'Bristol', 'West Haven',
    'Meriden', 'Milford', 'Stratford', 'East Hartford', 'Middletown',
    'Wallingford', 'Enfield', 'Fairfield', 'Manchester', 'Greenwich',
  ],
  delaware: [
    'Wilmington', 'Dover', 'Newark', 'Middletown', 'Smyrna',
    'Milford', 'Seaford', 'Georgetown', 'Elsmere', 'New Castle',
    'Lewes', 'Rehoboth Beach', 'Bear', 'Hockessin', 'Brookside',
  ],
  florida: [
    'Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale', 'Tallahassee',
    'St. Petersburg', 'Hialeah', 'Port St. Lucie', 'Cape Coral',
    'Pembroke Pines', 'Hollywood', 'Gainesville', 'Coral Springs', 'Miramar',
    'Lehigh Acres', 'Clearwater', 'Brandon', 'Palm Bay', 'West Palm Beach',
    'Pompano Beach', 'Lakeland', 'Davie', 'Miami Gardens', 'Boca Raton',
    'Sunrise', 'Plantation', 'Deltona', 'Fort Myers', 'Largo',
    'Melbourne', 'Deerfield Beach', 'Palm Coast', 'Daytona Beach', 'Kissimmee',
    'Sarasota', 'Naples', 'Doral', 'Pensacola', 'Ocala',
  ],
  georgia: [
    'Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon',
    'Athens', 'Sandy Springs', 'Roswell', 'Johns Creek', 'Albany',
    'Warner Robins', 'Alpharetta', 'Marietta', 'Valdosta', 'Smyrna',
    'Dunwoody', 'Brookhaven', 'Peachtree Corners', 'Mableton', 'Gainesville',
    'Newnan', 'Milton', 'Douglasville', 'Carrollton', 'Statesboro',
  ],
  hawaii: [
    'Honolulu', 'Hilo', 'Kailua', 'Kaneohe', 'Waipahu',
    'Pearl City', 'Mililani', 'Kihei', 'Ewa Beach', 'Kahului',
    'Wailuku', 'Lihue', 'Kapolei', 'Wahiawa', 'Aiea',
  ],
  idaho: [
    'Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Pocatello',
    'Caldwell', 'Coeur d’Alene', 'Twin Falls', 'Lewiston', 'Post Falls',
    'Rexburg', 'Moscow', 'Eagle', 'Kuna', 'Ammon',
    'Chubbuck', 'Hayden', 'Mountain Home', 'Blackfoot', 'Garden City',
  ],
  illinois: [
    'Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Springfield',
    'Elgin', 'Peoria', 'Champaign', 'Waukegan',
    'Cicero', 'Bloomington', 'Schaumburg', 'Evanston', 'Decatur',
    'Bolingbrook', 'Palatine', 'Skokie', 'Des Plaines', 'Orland Park',
    'Tinley Park', 'Oak Lawn', 'Berwyn', 'Mount Prospect', 'Normal',
    'Wheaton', 'Hoffman Estates', 'Oak Park', 'Downers Grove', 'Elmhurst',
  ],
  indiana: [
    'Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Bloomington',
    'Carmel', 'Fishers', 'Hammond', 'Gary', 'Lafayette',
    'Muncie', 'Noblesville', 'Greenwood', 'Anderson', 'Terre Haute',
    'Kokomo', 'Elkhart', 'Mishawaka', 'Westfield', 'Lawrence',
  ],
  iowa: [
    'Des Moines', 'Cedar Rapids', 'Davenport', 'Sioux City', 'Iowa City',
    'Waterloo', 'Council Bluffs', 'Ames', 'West Des Moines', 'Dubuque',
    'Ankeny', 'Urbandale', 'Cedar Falls', 'Marion', 'Bettendorf',
    'Mason City', 'Marshalltown', 'Clinton', 'Burlington', 'Ottumwa',
  ],
  kansas: [
    'Wichita', 'Overland Park', 'Kansas City', 'Topeka', 'Olathe',
    'Lawrence', 'Shawnee', 'Manhattan', 'Lenexa', 'Salina',
    'Hutchinson', 'Leavenworth', 'Leawood', 'Dodge City', 'Garden City',
    'Junction City', 'Emporia', 'Derby', 'Prairie Village', 'Hays',
  ],
  kentucky: [
    'Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Frankfort',
    'Covington', 'Hopkinsville', 'Richmond', 'Florence', 'Georgetown',
    'Henderson', 'Elizabethtown', 'Nicholasville', 'Jeffersontown', 'Independence',
    'Radcliff', 'Ashland', 'Madisonville', 'Winchester', 'Murray',
  ],
  louisiana: [
    'New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles',
    'Kenner', 'Bossier City', 'Monroe', 'Alexandria', 'Houma',
    'Marrero', 'Hammond', 'Slidell', 'Laplace', 'Prairieville',
    'Central', 'Terrytown', 'Ruston', 'Sulphur', 'Harvey',
  ],
  maine: [
    'Portland', 'Lewiston', 'Bangor', 'Augusta', 'Biddeford',
    'Sanford', 'Saco', 'Westbrook', 'South Portland', 'Auburn',
    'Brunswick', 'Scarborough', 'Waterville', 'Gorham', 'York',
  ],
  maryland: [
    'Baltimore', 'Annapolis', 'Rockville', 'Frederick', 'Gaithersburg',
    'Bowie', 'Hagerstown', 'Salisbury', 'Greenbelt', 'College Park',
    'Cumberland', 'Westminster', 'Hyattsville', 'Takoma Park', 'Laurel',
    'Easton', 'Aberdeen', 'Cambridge', 'Havre de Grace', 'Ocean City',
  ],
  massachusetts: [
    'Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell',
    'Brockton', 'New Bedford', 'Quincy', 'Lynn', 'Fall River',
    'Newton', 'Lawrence', 'Somerville', 'Framingham', 'Haverhill',
    'Waltham', 'Malden', 'Brookline', 'Plymouth', 'Medford',
    'Taunton', 'Chicopee', 'Weymouth', 'Revere', 'Peabody',
  ],
  michigan: [
    'Detroit', 'Grand Rapids', 'Warren', 'Lansing', 'Ann Arbor',
    'Sterling Heights', 'Flint', 'Dearborn', 'Livonia', 'Westland',
    'Troy', 'Farmington Hills', 'Kalamazoo', 'Wyoming', 'Southfield',
    'Rochester Hills', 'Taylor', 'Pontiac', 'St. Clair Shores', 'Royal Oak',
    'Novi', 'Dearborn Heights', 'Battle Creek', 'Saginaw', 'Kentwood',
  ],
  minnesota: [
    'Minneapolis', 'St. Paul', 'Rochester', 'Duluth', 'Bloomington',
    'Brooklyn Park', 'Plymouth', 'Maple Grove', 'Woodbury', 'St. Cloud',
    'Eden Prairie', 'Eagan', 'Burnsville', 'Coon Rapids', 'Lakeville',
    'Blaine', 'Minnetonka', 'Apple Valley', 'Edina', 'St. Louis Park',
  ],
  mississippi: [
    'Jackson', 'Gulfport', 'Hattiesburg', 'Southaven', 'Biloxi',
    'Tupelo', 'Meridian', 'Olive Branch', 'Greenville', 'Horn Lake',
    'Pearl', 'Madison', 'Starkville', 'Clinton', 'Brandon',
    'Columbus', 'Vicksburg', 'Pascagoula', 'Oxford', 'Ocean Springs',
  ],
  missouri: [
    'Kansas City', 'St. Louis', 'Springfield', 'Independence', 'Columbia',
    'Lee’s Summit', 'O’Fallon', 'St. Joseph', 'St. Charles', 'St. Peters',
    'Blue Springs', 'Florissant', 'Joplin', 'Chesterfield', 'Jefferson City',
    'Cape Girardeau', 'Wildwood', 'University City', 'Ballwin', 'Raytown',
  ],
  montana: [
    'Billings', 'Missoula', 'Great Falls', 'Bozeman', 'Helena',
    'Butte', 'Kalispell', 'Havre', 'Anaconda', 'Miles City',
    'Belgrade', 'Livingston', 'Whitefish', 'Lewistown', 'Sidney',
  ],
  nebraska: [
    'Omaha', 'Lincoln', 'Bellevue', 'Grand Island', 'Kearney',
    'Fremont', 'Hastings', 'Norfolk', 'North Platte', 'Columbus',
    'Papillion', 'La Vista', 'Scottsbluff', 'South Sioux City', 'Beatrice',
  ],
  nevada: [
    'Las Vegas', 'Reno', 'Henderson', 'North Las Vegas', 'Carson City',
    'Sparks', 'Spring Valley', 'Sunrise Manor', 'Paradise', 'Enterprise',
    'Pahrump', 'Mesquite', 'Boulder City', 'Elko', 'Fernley',
    'Summerlin', 'Winchester', 'Whitney', 'Fallon', 'Gardnerville',
  ],
  'new-hampshire': [
    'Manchester', 'Nashua', 'Concord', 'Dover', 'Portsmouth',
    'Rochester', 'Keene', 'Salem', 'Derry', 'Merrimack',
    'Londonderry', 'Hudson', 'Bedford', 'Goffstown', 'Laconia',
  ],
  'new-jersey': [
    'Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Trenton',
    'Edison', 'Woodbridge', 'Lakewood', 'Toms River', 'Hamilton',
    'Clifton', 'Brick', 'Cherry Hill', 'Camden', 'Bayonne',
    'Passaic', 'Union City', 'East Orange', 'Vineland', 'Princeton',
    'New Brunswick', 'Hoboken', 'Plainfield', 'West New York', 'Atlantic City',
  ],
  'new-mexico': [
    'Albuquerque', 'Las Cruces', 'Rio Rancho', 'Santa Fe', 'Roswell',
    'Farmington', 'Clovis', 'Hobbs', 'Alamogordo', 'Carlsbad',
    'Gallup', 'Los Lunas', 'Sunland Park', 'Deming', 'Las Vegas',
  ],
  'new-york': [
    'New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany',
    'New Rochelle', 'Mount Vernon', 'Schenectady', 'Utica',
    'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Manhattan',
    'White Plains', 'Hempstead', 'Troy', 'Niagara Falls', 'Binghamton',
    'Freeport', 'Long Beach', 'Levittown', 'Valley Stream', 'Spring Valley',
    'Babylon', 'Brentwood', 'Hicksville', 'Ithaca', 'Saratoga Springs',
  ],
  'north-carolina': [
    'Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem',
    'Fayetteville', 'Cary', 'Wilmington', 'High Point', 'Concord',
    'Asheville', 'Greenville', 'Gastonia', 'Jacksonville', 'Apex',
    'Huntersville', 'Chapel Hill', 'Burlington', 'Wake Forest', 'Hickory',
    'Rocky Mount', 'Indian Trail', 'Mooresville', 'Wilson', 'Salisbury',
  ],
  'north-dakota': [
    'Fargo', 'Bismarck', 'Grand Forks', 'Minot', 'West Fargo',
    'Williston', 'Dickinson', 'Mandan', 'Jamestown', 'Wahpeton',
    'Devils Lake', 'Watford City', 'Valley City', 'Grafton', 'Beulah',
  ],
  ohio: [
    'Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton',
    'Parma', 'Canton', 'Youngstown', 'Lorain',
    'Hamilton', 'Springfield', 'Kettering', 'Elyria', 'Lakewood',
    'Cuyahoga Falls', 'Mentor', 'Beavercreek', 'Cleveland Heights', 'Strongsville',
    'Fairfield', 'Dublin', 'Westerville', 'Findlay', 'Warren',
  ],
  oklahoma: [
    'Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Edmond',
    'Lawton', 'Moore', 'Midwest City', 'Stillwater', 'Enid',
    'Muskogee', 'Bartlesville', 'Owasso', 'Shawnee', 'Yukon',
    'Bixby', 'Ardmore', 'Ponca City', 'Duncan', 'Del City',
  ],
  oregon: [
    'Portland', 'Salem', 'Eugene', 'Gresham', 'Bend',
    'Hillsboro', 'Beaverton', 'Medford', 'Springfield', 'Corvallis',
    'Albany', 'Tigard', 'Lake Oswego', 'Keizer', 'Grants Pass',
    'Oregon City', 'McMinnville', 'Redmond', 'Tualatin', 'West Linn',
  ],
  pennsylvania: [
    'Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Harrisburg',
    'Reading', 'Scranton', 'Bethlehem', 'Lancaster', 'Levittown',
    'Wilkes-Barre', 'Altoona', 'York', 'Easton', 'State College',
    'Norristown', 'Chester', 'Bensalem', 'Plum', 'Williamsport',
    'McKeesport', 'Pottstown', 'Hazleton', 'New Castle', 'Johnstown',
  ],
  'rhode-island': [
    'Providence', 'Warwick', 'Cranston', 'Pawtucket', 'East Providence',
    'Woonsocket', 'Newport', 'Central Falls', 'Westerly', 'North Providence',
    'Cumberland', 'Coventry', 'North Kingstown', 'West Warwick', 'Johnston',
  ],
  'south-carolina': [
    'Columbia', 'Charleston', 'North Charleston', 'Mount Pleasant', 'Greenville',
    'Rock Hill', 'Spartanburg', 'Summerville', 'Sumter', 'Goose Creek',
    'Hilton Head Island', 'Florence', 'Aiken', 'Myrtle Beach', 'Anderson',
    'Greer', 'Mauldin', 'Hanahan', 'Conway', 'Easley',
  ],
  'south-dakota': [
    'Sioux Falls', 'Rapid City', 'Aberdeen', 'Pierre', 'Brookings',
    'Watertown', 'Mitchell', 'Yankton', 'Huron', 'Vermillion',
    'Spearfish', 'Brandon', 'Box Elder', 'Madison', 'Sturgis',
  ],
  tennessee: [
    'Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville',
    'Murfreesboro', 'Franklin', 'Jackson', 'Johnson City', 'Bartlett',
    'Hendersonville', 'Kingsport', 'Collierville', 'Smyrna', 'Cleveland',
    'Brentwood', 'Germantown', 'Columbia', 'Spring Hill', 'La Vergne',
  ],
  texas: [
    'Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso',
    'Arlington', 'Corpus Christi', 'Plano', 'Laredo',
    'Lubbock', 'Irving', 'Garland', 'Frisco', 'McKinney',
    'Amarillo', 'Grand Prairie', 'Brownsville', 'Killeen', 'Pasadena',
    'McAllen', 'Mesquite', 'Midland', 'Denton', 'Carrollton',
    'Round Rock', 'Abilene', 'Pearland', 'Richardson', 'Odessa',
    'Sugar Land', 'Beaumont', 'Lewisville', 'Tyler', 'College Station',
    'Wichita Falls', 'League City', 'Allen', 'Conroe', 'Bryan',
    'Edinburg', 'Mission', 'New Braunfels', 'Spring', 'Cypress',
  ],
  utah: [
    'Salt Lake City', 'West Valley City', 'Provo', 'West Jordan', 'Orem',
    'Sandy', 'St. George', 'Ogden', 'Layton', 'South Jordan',
    'Lehi', 'Millcreek', 'Taylorsville', 'Logan', 'Murray',
    'Draper', 'Bountiful', 'Riverton', 'Herriman', 'Spanish Fork',
  ],
  vermont: [
    'Burlington', 'South Burlington', 'Rutland', 'Montpelier', 'Essex',
    'Colchester', 'Bennington', 'Brattleboro', 'Hartford', 'Milton',
    'Williston', 'Springfield', 'Barre', 'Middlebury', 'St. Albans',
  ],
  virginia: [
    'Virginia Beach', 'Norfolk', 'Richmond', 'Arlington', 'Alexandria',
    'Chesapeake', 'Newport News', 'Hampton', 'Roanoke', 'Lynchburg',
    'Suffolk', 'Portsmouth', 'Manassas', 'Charlottesville', 'Harrisonburg',
    'Reston', 'Petersburg', 'Centreville', 'Blacksburg', 'Leesburg',
    'Annandale', 'Ashburn', 'Tysons', 'McLean', 'Springfield',
  ],
  washington: [
    'Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Olympia',
    'Kent', 'Everett', 'Renton', 'Yakima', 'Federal Way',
    'Spokane Valley', 'Bellingham', 'Kennewick', 'Auburn', 'Pasco',
    'Marysville', 'Lakewood', 'Redmond', 'Shoreline', 'Kirkland',
    'Sammamish', 'Burien', 'Edmonds', 'Bothell', 'Puyallup',
  ],
  'west-virginia': [
    'Charleston', 'Huntington', 'Morgantown', 'Parkersburg', 'Wheeling',
    'Weirton', 'Fairmont', 'Martinsburg', 'Beckley', 'Clarksburg',
    'South Charleston', 'Teays Valley', 'St. Albans', 'Vienna', 'Bluefield',
  ],
  wisconsin: [
    'Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine',
    'Appleton', 'Waukesha', 'Eau Claire', 'Oshkosh', 'Janesville',
    'West Allis', 'La Crosse', 'Sheboygan', 'Wauwatosa', 'Fond du Lac',
    'Brookfield', 'New Berlin', 'Beloit', 'Greenfield', 'Franklin',
  ],
  wyoming: [
    'Cheyenne', 'Casper', 'Laramie', 'Gillette', 'Rock Springs',
    'Sheridan', 'Green River', 'Evanston', 'Riverton', 'Jackson',
    'Cody', 'Rawlins', 'Lander', 'Powell', 'Torrington',
  ],
};

export function citiesOf(stateSlug) {
  return STATE_CITIES[stateSlug] || [];
}
