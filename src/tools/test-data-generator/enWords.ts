/**
 * English 路径轻量词表（数据语言英文路径，见 CONTEXT.md：数据语言）。
 *
 * 英文路径不引入 faker en locale（≈114 KB，超预算 2 倍+），全部为合成词条：
 * 每类百余条，纯本地、零网络。词条是常见英美人名/街道/城市名的合成拼装，
 * 明确标注非真实，不指向真实个人或地点。
 */

export const FIRST_NAMES: readonly string[] = [
  'Aaron', 'Ada', 'Adam', 'Aidan', 'Alan', 'Albert', 'Alice', 'Amber', 'Amelia', 'Andre',
  'Angela', 'Anna', 'Anthony', 'April', 'Arthur', 'Ashley', 'Austin', 'Barbara', 'Beatrice', 'Benjamin',
  'Beth', 'Blake', 'Brandon', 'Brenda', 'Brian', 'Bruce', 'Caleb', 'Cameron', 'Carla', 'Caroline',
  'Catherine', 'Cecil', 'Charles', 'Chloe', 'Claire', 'Clara', 'Clifford', 'Colin', 'Connor', 'Cynthia',
  'Dale', 'Daniel', 'Daphne', 'Darren', 'David', 'Dawn', 'Dean', 'Deborah', 'Dennis', 'Derek',
  'Diana', 'Dylan', 'Edgar', 'Edith', 'Edward', 'Elaine', 'Eleanor', 'Elias', 'Elijah', 'Elizabeth',
  'Ella', 'Elliot', 'Emily', 'Emma', 'Eric', 'Ernest', 'Esther', 'Ethan', 'Eugene', 'Eva',
  'Evelyn', 'Ezra', 'Felix', 'Fiona', 'Florence', 'Frances', 'Frank', 'Gavin', 'Gerald', 'Gillian',
  'Glen', 'Grace', 'Gregory', 'Gwendolyn', 'Hannah', 'Harold', 'Harriet', 'Harvey', 'Hazel', 'Heather',
  'Helen', 'Henry', 'Herbert', 'Homer', 'Howard', 'Hugh', 'Ian', 'Irene', 'Iris', 'Isaac',
  'Isabel', 'Ivan', 'Jacob', 'Jane', 'Jason', 'Jasper', 'Jean', 'Jeffrey', 'Jennifer', 'Jeremy',
  'Joan', 'Joanna', 'John', 'Jonah', 'Jordan', 'Joseph', 'Joyce', 'Judith', 'Julia', 'Julian',
]

export const LAST_NAMES: readonly string[] = [
  'Abbott', 'Adkins', 'Albright', 'Aldrich', 'Appleton', 'Archer', 'Ashford', 'Atwood', 'Avery', 'Bailey',
  'Baldwin', 'Barnes', 'Barrett', 'Bassett', 'Bellamy', 'Bennett', 'Berry', 'Bishop', 'Blackwood', 'Blythe',
  'Boland', 'Boone', 'Bowen', 'Boyd', 'Bradley', 'Briggs', 'Brooks', 'Browning', 'Bryant', 'Buckley',
  'Burke', 'Burns', 'Burton', 'Butler', 'Byrne', 'Calhoun', 'Cameron', 'Campbell', 'Carlton', 'Carson',
  'Chambers', 'Chandler', 'Chapman', 'Charlton', 'Chase', 'Chester', 'Clark', 'Clayton', 'Coleman', 'Collier',
  'Conway', 'Cooper', 'Cortez', 'Crane', 'Crosby', 'Curtis', 'Dalton', 'Daniels', 'Davenport', 'Dawson',
  'Dixon', 'Donnelly', 'Dorsey', 'Drake', 'Dunlap', 'Eastwood', 'Edwards', 'Ellison', 'Emerson', 'Everett',
  'Fairfax', 'Falkner', 'Farnsworth', 'Faulkner', 'Fischer', 'Fleming', 'Fletcher', 'Foley', 'Forbes', 'Foster',
  'Fox', 'Freeman', 'Fuller', 'Gallagher', 'Gardner', 'Garrett', 'Gibbons', 'Gibson', 'Gilbert', 'Giles',
  'Glover', 'Gordon', 'Graham', 'Grant', 'Graves', 'Grayson', 'Greenwood', 'Griffin', 'Grover', 'Hale',
  'Halliday', 'Hamilton', 'Hansen', 'Harding', 'Harmon', 'Harrington', 'Hartley', 'Hawkins', 'Hayes', 'Henderson',
]

/** 街道名（合成「N <street>」形态），街道类型后缀按条目内嵌。 */
export const STREETS: readonly string[] = [
  'Acorn Avenue', 'Adelaide Road', 'Alder Lane', 'Amber Street', 'Anchor Way', 'Apple Court',
  'Arbor Drive', 'Archer Avenue', 'Ash Crescent', 'Aspen Way', 'Aurora Street', 'Autumn Lane',
  'Baker Street', 'Balmoral Road', 'Banyan Court', 'Barley Way', 'Bayberry Lane', 'Beacon Street',
  'Beechwood Avenue', 'Bell Lane', 'Birchwood Drive', 'Bluebell Way', 'Bond Street', 'Bramble Court',
  'Brighton Road', 'Brook Lane', 'Buckingham Way', 'Cedar Crescent', 'Chancery Lane', 'Chapel Street',
  'Cherry Court', 'Chestnut Drive', 'Clarendon Road', 'Cliffside Way', 'Clover Lane', 'Cobblestone Court',
  'Colonial Drive', 'Copper Street', 'Coral Way', 'Cornwall Road', 'Cottonwood Lane', 'Crane Street',
  'Crescent Way', 'Cypress Drive', 'Dahlia Street', 'Dale Court', 'Dandelion Lane', 'Davenport Road',
  'Dawn Drive', 'Dover Street', 'Dublin Way', 'Duke Street', 'Eagle Lane', 'Eastbourne Road',
  'Elderberry Court', 'Elm Grove', 'Emerald Street', 'Essex Road', 'Fairfield Way', 'Fernwood Lane',
  'Finch Court', 'Fleet Street', 'Fletcher Road', 'Flint Way', 'Forest Avenue', 'Foxglove Lane',
  'Franklin Street', 'Frost Way', 'Gardenia Court', 'Garnet Street', 'Gordon Road', 'Granite Way',
  'Greenfield Lane', 'Grosvenor Road', 'Halloway Street', 'Hamilton Drive', 'Hampton Court', 'Harbor Lane',
  'Harrison Road', 'Hawthorn Street', 'Hazelnut Way', 'Hemlock Drive', 'Henley Road', 'Hickory Lane',
  'Holly Court', 'Honey Street', 'Howard Way', 'Hunter Road', 'Ivy Lane', 'Jasmine Court',
  'Jasper Street', 'Juniper Drive', 'Keystone Way', 'Kingston Road', 'Larkspur Lane', 'Laurel Street',
  'Lavender Way', 'Leicester Road', 'Lemon Court', 'Linden Drive', 'Lombard Street', 'Lotus Lane',
  'Magnolia Avenue', 'Mahogany Way', 'Maplewood Drive', 'Marigold Lane', 'Marlow Road', 'Meadowbrook Court',
  'Mercer Street', 'Merton Road', 'Milestone Way', 'Milton Lane', 'Monarch Drive', 'Mulberry Street',
]

/** 城市条目「City, ST」形态（合成美国风格市名 + 州缩写）。 */
export const CITIES: readonly [string, string][] = [
  ['Abington', 'MA'], ['Alden', 'IA'], ['Alton', 'IL'], ['Amherst', 'NH'], ['Ansonia', 'CT'],
  ['Ardmore', 'OK'], ['Arlington', 'TX'], ['Ashland', 'OR'], ['Auburn', 'AL'], ['Aurora', 'CO'],
  ['Bakersfield', 'CA'], ['Ballwin', 'MO'], ['Bartow', 'FL'], ['Bedford', 'OH'], ['Belmont', 'CA'],
  ['Benton', 'AR'], ['Berwick', 'PA'], ['Beverly', 'MA'], ['Billings', 'MT'], ['Bismarck', 'ND'],
  ['Bloomfield', 'NJ'], ['Bogalusa', 'LA'], ['Boise', 'ID'], ['Bowie', 'MD'], ['Bradford', 'PA'],
  ['Brea', 'CA'], ['Bremerton', 'WA'], ['Bristol', 'TN'], ['Brockton', 'MA'], ['Bryan', 'TX'],
  ['Burley', 'ID'], ['Butte', 'MT'], ['Cairo', 'IL'], ['Camden', 'NJ'], ['Canton', 'OH'],
  ['Carrollton', 'GA'], ['Cedarburg', 'WI'], ['Centerville', 'UT'], ['Chambersburg', 'PA'], ['Chandler', 'AZ'],
  ['Chapel Hill', 'NC'], ['Charlestown', 'IN'], ['Cheyenne', 'WY'], ['Claremont', 'NH'], ['Clarksdale', 'MS'],
  ['Clayton', 'MO'], ['Clinton', 'IA'], ['Coffeyville', 'KS'], ['Collinsville', 'IL'], ['Columbus', 'GA'],
  ['Concord', 'NH'], ['Conway', 'AR'], ['Corning', 'NY'], ['Corvallis', 'OR'], ['Covington', 'KY'],
  ['Crawfordsville', 'IN'], ['Crestline', 'OH'], ['Cumberland', 'MD'], ['Danbury', 'CT'], ['Danville', 'VA'],
  ['Davenport', 'IA'], ['Dayton', 'OH'], ['Decatur', 'AL'], ['Denton', 'TX'], ['Derry', 'NH'],
  ['Dillon', 'MT'], ['Dixon', 'IL'], ['Dodge City', 'KS'], ['Dover', 'DE'], ['Dubuque', 'IA'],
  ['Duluth', 'MN'], ['Duncan', 'OK'], ['Dunmore', 'PA'], ['Durango', 'CO'], ['Easton', 'PA'],
  ['Effingham', 'IL'], ['Elgin', 'IL'], ['Elk City', 'OK'], ['Ellsworth', 'ME'], ['Elmhurst', 'IL'],
  ['Elmira', 'NY'], ['Elreno', 'OK'], ['Elyria', 'OH'], ['Emporia', 'KS'], ['Enid', 'OK'],
  ['Erie', 'PA'], ['Escondido', 'CA'], ['Eufaula', 'AL'], ['Evansville', 'IN'], ['Fairbury', 'NE'],
  ['Fairfield', 'IA'], ['Fallbrook', 'CA'], ['Farmington', 'NM'], ['Fayetteville', 'NC'], ['Findlay', 'OH'],
  ['Florence', 'SC'], ['Fond du Lac', 'WI'], ['Fort Dodge', 'IA'], ['Franklin', 'TN'], ['Frederick', 'MD'],
  ['Freeport', 'IL'], ['Fremont', 'NE'], ['Gadsden', 'AL'], ['Galena', 'KS'], ['Galesburg', 'IL'],
  ['Gallup', 'NM'], ['Gardner', 'KS'], ['Geneva', 'NY'], ['Georgetown', 'TX'], ['Gloucester', 'MA'],
  ['Godfrey', 'IL'], ['Goshen', 'IN'], ['Grafton', 'WV'], ['Granbury', 'TX'], ['Grand Haven', 'MI'],
  ['Greeley', 'CO'], ['Greenfield', 'MA'], ['Greenville', 'MS'], ['Grinnell', 'IA'], ['Guthrie', 'OK'],
  ['Hagerstown', 'MD'], ['Hallandale', 'FL'], ['Hamilton', 'OH'], ['Hanover', 'PA'], ['Hartford', 'CT'],
  ['Hastings', 'NE'], ['Havre', 'MT'], ['Helena', 'MT'], ['Herkimer', 'NY'], ['Hickory', 'NC'],
  ['Hillsboro', 'OR'], ['Hinton', 'WV'], ['Holland', 'MI'], ['Holyoke', 'MA'], ['Homestead', 'FL'],
]

/** 公司名部件：前缀词 / 中心词 / 后缀形态。 */
export const COMPANY_PREFIXES: readonly string[] = [
  'Bright', 'Cedar', 'Cobalt', 'Crest', 'Crystal', 'Dawn', 'Delta', 'Eastwind', 'Evergreen', 'Falcon',
  'First', 'Frontier', 'Gateway', 'Grand', 'Harbor', 'Harvest', 'Hilltop', 'Horizon', 'Ironwood', 'Keystone',
  'Lakeside', 'Lantern', 'Legacy', 'Liberty', 'Lighthouse', 'Maple', 'Meridian', 'Northstar', 'Oakfield', 'Pinnacle',
  'Pioneer', 'Redwood', 'Riverstone', 'Silverline', 'Skyline', 'Solstice', 'Summit', 'Sunrise', 'Timberline', 'Union',
  'Vanguard', 'Westgate', 'Whitecap', 'Windmere', 'Stonebridge', 'Bluepeak', 'Clearwater', 'Falconcrest', 'Northgate', 'Rosewood',
]

export const COMPANY_NOUNS: readonly string[] = [
  'Analytics', 'Aerospace', 'Automotive', 'Biotech', 'Capital', 'Chemical', 'Consulting', 'Digital', 'Dynamics', 'Energy',
  'Engineering', 'Financial', 'Foods', 'Foundry', 'Furniture', 'Global', 'Hardware', 'Holdings', 'Industries', 'Insurance',
  'Interactive', 'Laboratories', 'Logistics', 'Manufacturing', 'Marine', 'Media', 'Medical', 'Metals', 'Mining', 'Motors',
  'Networks', 'Optics', 'Partners', 'Pharma', 'Publishing', 'Robotics', 'Software', 'Solutions', 'Systems', 'Technologies',
  'Telecom', 'Textiles', 'Tools', 'Trading', 'Transport', 'Ventures', 'Warehousing', 'Semiconductor', 'Printing', 'Agriculture',
]

export const COMPANY_SUFFIXES: readonly string[] = [
  'Inc.', 'LLC', 'Corp.', 'Ltd.', 'Group', 'Co.', 'Partners', 'Holdings', 'Associates', 'International',
]

/** Lorem ipsum 英文词池（固定_vocab_，Lorem ipsum 生成并入本工具的英文路径）。 */
export const LOREM_WORDS: readonly string[] = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do',
  'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim',
  'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip',
  'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat',
  'non', 'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id',
  'est', 'laborum', 'mauris', 'vitae', 'ultricies', 'leo', 'integer', 'malesuada', 'nunc', 'vel',
  'risus', 'commodo', 'viverra', 'maecenas', 'accumsan', 'lacus', 'vestibulum', 'morbi', 'tristique', 'senectus',
  'netus', 'fames', 'turpis', 'egestas', 'donec', 'quam', 'felis', 'suspendisse', 'potenti', 'tortor',
]
