/** Split a whitespace-separated list and drop any accidental duplicates. */
const words = (s: string): string[] => [...new Set(s.trim().split(/\s+/))];

/* ───────────────────────── First names ───────────────────────── */

const FIRST_CLASSIC = words(`
James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Mark Donald Steven
Paul Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan
Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Frank Patrick Raymond Jack Dennis Jerry Tyler Aaron
Adam Nathan Henry Douglas Zachary Peter Kyle Ethan Walter Noah Jeremy Christian Keith Roger Terry Gerald Harold Sean
Austin Carl Arthur Lawrence Dylan Jesse Bryan Billy Bruce Gabriel Logan Albert Willie Alan Wayne Elijah Roy Vincent Ralph
Eugene Russell Bobby Mason Philip Louis Johnny Howard Fred Ernest Martin Craig Stanley Todd Leonard Dale Norman Allen
Marvin Glenn Calvin Clifford Curtis Chad Cole Dustin Shane Travis Derek Marcus Caleb Ian Evan Luke Owen Isaac Connor
Hunter Jackson Landon Colton Gavin Cooper Brody Dawson Grayson Tristan Spencer Garrett Bennett Wesley Preston Chase
Miles Theo Silas Jude Felix Oscar Leo Ezra Emmett Finn Rhys Declan Callum Rory Brendan Cormac Desmond Everett Gideon
Graham Harrison Julian Kent Lance Maxwell Nolan Orson Pierce Quentin Reid Sterling Tobias Wyatt Xander Zane
`);

const FIRST_MODERN = words(`
Jaxon Jayden Easton Maverick Brayden Weston Tucker Brooks Beckett Rhett Knox Ryker Bodie Brantley Camden Cash Crew Dax
Emerson Granger Holden Kaiser Koda Lennox Lochlan Memphis Paxton Reese Remington Rowan Sawyer Stetson Tate Thatcher
Wilder Zander Ace Archer Atlas Axel Bryce Cannon Colt Dallas Eli Fox Hendrix Jett Kade Kash Keegan Landry Legend
Mylo Nash Orion Ridge Ryder Scout Slade Stone Titan Trace Wells Zeke Barrett Brock Calloway Dane Dean Flynn Gage
`);

const FIRST_BLACK_AMERICAN = words(`
DeAndre Darnell Terrell Jamal Tyrone Marquis Lamont Rashad Dante Isaiah Jalen Malik Cedric Demetrius Devonte Trevon
Tavon Javon Keshawn Rasheed Khalil Kareem Amir Darius Xavier Terrence Reggie Antoine Cornelius Maurice Quincy Ladarius
Deshawn Dontae Jermaine Lavar Montel Raheem Shamar Tariq Tyree Tyrell Davonte Delvin Demarcus Dequan Elon Jabari
Jaylen Kendrick Kobe Lamar Lonnie Marcellus Marlon Nate Omari Rodney Roman Sylvester Terron Treyvon Wendell Zion
Amari Bryson Cam Chauncey Cortez Dashawn Deion Dewayne Donovan Emanuel Fredrick Hakeem Jamarion Jaquan Kenyon Lorenzo
Mekhi Micah Nigel Percy Quentin Rakeem Shaquan Tyshawn Vernon Wade Zaire Kenji Trey
`);

const FIRST_LATINO = words(`
Mateo Santiago Sebastian Diego Alejandro Emiliano Javier Rafael Santino Joaquin Hector Mauricio Ignacio Leandro Rodrigo
Ramon Esteban Andres Cristian Adrian Alvaro Angel Armando Benicio Camilo Cesar Damian Eduardo Emilio Enrique Ernesto
Fabian Federico Felipe Fernando Francisco Gonzalo Guillermo Gustavo Humberto Ivan Jairo Jorge Julio Lazaro Leonel
Lucas Manuel Marcelo Mario Martin Matias Miguel Nelson Nestor Octavio Omar Pablo Pedro Rafa Raul Ricardo Roberto
Rolando Ruben Salvador Santos Saul Sergio Tadeo Thiago Tomas Ulises Valentin Vicente Xavi Yahir Joel Osvaldo Beto
`);

const FIRST_ASIAN = words(`
Hiro Kenji Takumi Daichi Ren Haruto Jin Minjun Seojun Wei Jian Hao Arjun Rohan Vikram Aarav Dev Rahul Anil Sanjay
Nikhil Bao Tuan Minh Duc Kai Keoni Makoa Akira Daiki Haruki Hideo Itsuki Kazuki Kenta Kouki Naoki Riku Ryota Shin
Sota Taiga Yuki Yuto Joon Hyun Dae Jae Sung Tae Woo Jun Cheng Ming Feng Lei Long Qiang Tao Yang Zhen Bo Chun
Anand Ashwin Dhruv Ishaan Kabir Karan Krish Manish Mohan Naveen Pranav Rajiv Ravi Samir Siddharth Tarun Vihaan
Hung Khoi Nam Phuc Quan Thanh Viet Anh Khang Linh Bach Dat Hai Sang Aiden Ryo Haru Kenzo Shinji
`);

const FIRST_AFRICAN = words(`
Kofi Kwame Chidi Emeka Femi Tunde Olu Sekou Mamadou Ibrahim Yusuf Idris Jabari Amare Desta Tendai Kagiso Thabo Sipho
Nnamdi Obinna Chinedu Adebayo Ayodele Babatunde Chibuike Dayo Ebuka Folarin Gbenga Ikenna Jide Kayode Kunle Lekan
Mandla Musa Ngozi Nkem Obi Olamide Oluwaseun Rotimi Segun Sunday Tochi Uche Uzoma Wale Yaw Zola Abdoulaye Amadou
Cheikh Demba Ousmane Modou Boubacar Issa Bakary Seydou Lamine Moussa Kwesi Kojo Nana Yaa Kwabena Ekow Tau Themba
Bheki Lwazi Sizwe Tumelo Kagiso Tshepo Mbali Dumisani Hamisi Juma Baraka Tariku Dawit Kidus Yonas Mulugeta
`);

const FIRST_EUROPEAN = words(`
Luka Nikola Marko Stefan Matteo Luca Lorenzo Marco Enzo Anton Lars Erik Magnus Soren Henrik Ivan Dmitri Pavel Tomasz
Jakub Andrei Bogdan Cristian Dragan Goran Igor Jovan Milan Miroslav Nemanja Petar Radovan Rade Srdjan Vladimir Zoran
Aleksander Bartosz Kacper Krzysztof Lukasz Marek Mateusz Piotr Wojciech Dominik Filip Karel Matej Ondrej Tibor
Bjorn Emil Gunnar Hakon Ingmar Jens Knut Leif Mats Niklas Olaf Rasmus Stellan Thor Viggo Axel Casper Jonas Mikkel
Klaus Dieter Florian Fabian Gerrit Hendrik Jannik Joost Maarten Pieter Ruud Sander Thijs Wim Yannick Alain Antoine
Baptiste Gaspard Hugo Jules Lucien Maxime Olivier Remy Theo Thibault Etienne Giovanni Paolo Salvatore Dario Fabio
Gianluca Massimo Riccardo Tommaso Vito Nuno Rui Tiago Joao Duarte Goncalo Ruben Hristo Kaloyan Plamen Teodor
Yannis Nikos Giorgos Dimitri Stavros Kostas Theodoros Aris Lazar Mihai Radu Vlad Emeric Gabor Zsolt Laszlo
`);

const FIRST_MIDDLE_EAST = words(`
Omar Hassan Karim Nabil Zaid Samir Farid Yasin Tarek Adel Bilal Faisal Hamza Idris Jamil Khaled Mahmoud Malik Nadim
Rashid Saeed Salim Tamer Walid Yousef Amir Ayman Cyrus Darius Reza Arman Babak Dariush Kian Navid Soroush Arash
Emre Mehmet Murat Burak Cem Deniz Kerem Selim Tolga Eitan Gil Noam Yair Idan Ori Avi Itai Levi Tavor
`);

const FIRST_PACIFIC = words(`
Keanu Kalani Koa Kainoa Makana Nalu Kekoa Leilo Kaimana Pono Mana Tane Rangi Manu Sione Tavita Lotu Viliami Sefo
Tevita Joshua Siosaia Fetu Malo Isaia Ioane Peni Filipo Tomasi
`);

export const FIRST_NAMES: string[] = [
  ...new Set([
    ...FIRST_CLASSIC,
    ...FIRST_MODERN,
    ...FIRST_BLACK_AMERICAN,
    ...FIRST_LATINO,
    ...FIRST_ASIAN,
    ...FIRST_AFRICAN,
    ...FIRST_EUROPEAN,
    ...FIRST_MIDDLE_EAST,
    ...FIRST_PACIFIC,
  ]),
];

export const FEMALE_FIRST: string[] = words(`
Aaliyah Abigail Adriana Alana Alexis Alicia Alina Amara Amelia Amira Ana Andrea Angela Anika Aria Ariana Ashley Aubrey
Audrey Ava Bianca Brianna Brooke Camila Carmen Cassidy Chloe Claire Daniela Danielle Delaney Destiny Diana Eden Elena
Eliana Elise Ella Emma Esperanza Eva Faith Fatima Gabriela Gianna Grace Hana Hannah Harper Hayley Helen Imani Isabel
Isla Ivy Jada Jasmine Jayla Jazmine Jenna Jessica Jordyn Julia Kaitlyn Kali Kara Kayla Keisha Kendra Kiara Kira Lauren
Layla Leah Leilani Lena Lila Lily Lucia Luna Madison Maia Mali Marisol Mariah Maya Mei Mia Mika Mila Monica Naia Naomi
Natalia Nia Nicole Nina Noelle Olivia Paige Parker Priya Quinn Rachel Raina Reese Riley Rosa Ruby Sabrina Sade Samara
Sara Savannah Serena Simone Sofia Sophia Talia Tamara Tatiana Tessa Tiana Valentina Vanessa Veronica Victoria Violet
Yara Yasmin Zahra Zaria Zoe Adaeze Amaka Chioma Folake Nkechi Yetunde Zainab Aisha Halima Layal Noor Rania Salma Yasmine
Aiko Akari Hana Haruka Mai Mio Rin Sakura Yui Yuna Jia Lan Li Meilin Xiu Ying Anjali Deepa Divya Kavya Meera Neha Pooja
Riya Sana Tanvi Thao Linh Mai Trang Camille Colette Elodie Margaux Ines Lola Manon Chiara Elisa Giulia Martina Sofie
Ingrid Freja Astrid Signe Elsa Katarina Milica Jelena Ivana Natasha Olga Tamar Leila Shira Mara Rebecca Tanya Lydia
Whitney Tamika Latoya Keandra Ebony Jaelyn Kennedy Londyn Makayla Nevaeh Skylar Taylor Brynn Cecilia Dahlia Esme
Fiona Gemma Heidi Iris Jolie Kaia Lexi Marlee Nora Opal Penelope Rowan Sienna Thea Vera Willa Zuri Alani Malia
Noelani Leia Moana Talia Anahi Ximena Renata Paloma Itzel Dulce Fernanda Marina Paula Rocio Alma Bella Elvira
`);

/* ───────────────────────── Last names ───────────────────────── */

const LAST_ENGLISH = words(`
Abbott Ackerman Adair Addison Albright Alden Allard Ambrose Ames Anders Archer Armstrong Arnett Ashby Ashford Atwood
Austin Avery Bailey Baird Baldwin Barlow Barnes Barrett Barton Bastian Baxter Beaumont Beckett Bellamy Bennett Benson
Bentley Beresford Bishop Blackwell Blair Blake Bolton Booker Boone Bowman Boyd Bradford Bradley Brandt Brennan Brewer
Briggs Brock Brooks Buchanan Buckley Burke Burnett Burton Byrne Cahill Caldwell Callahan Cameron Campbell Carlisle
Carmichael Carrington Carver Cassidy Chambers Chandler Chapman Chase Christie Clayton Clifford Coburn Colby Collier
Conway Cooper Corbin Cornell Crawford Crosby Cullen Cunningham Dalton Daniels Darby Davenport Dawson Decker Delaney
Dennison Dexter Dillon Donovan Douglas Doyle Drummond Dudley Duffy Duncan Dunn Durham Eastman Eaton Edmonds Egan
Elliott Ellison Emerson Emery Ennis Erwin Evans Everett Fairchild Farley Farrell Faulkner Fenton Ferguson Finch
Finley Fitzgerald Flanagan Fletcher Flynn Forbes Foster Fowler Franklin Frazier Fuller Gallagher Gardner Garrett
Gentry Gibbs Gilbert Gillespie Glover Goodwin Gordon Graham Granger Grayson Griffin Grover Guthrie Hadley Hagan
Hale Halloran Hamilton Hammond Hampton Hanley Hardin Harlan Harmon Harper Harrington Hartley Harvey Hastings
Hatfield Hawkins Hayden Heath Henderson Hendrix Hensley Herbert Hobbs Hodges Holbrook Holden Holland Hollis Holmes
Hooper Hopkins Horton Howard Hudson Huffman Hughes Hunt Hutchins Ingram Irwin Jacobs Jarvis Jeffries Jenkins
Jennings Jessup Joyce Kane Keane Kearney Keegan Keller Kelley Kendrick Kennedy Kerr Kilgore Kincaid Kingsley Kirby
Kirkland Knight Lambert Lancaster Landry Larkin Latham Lawson Leary Lennox Leonard Lester Lewis Lindsey Livingston
Lockhart Logan Lowell Lucas Lyle Madden Maddox Magee Maguire Mahoney Malone Manning Marlowe Marsh Marshall Mason
Massey Mathis Maxwell McBride McCall McCoy McDaniel McGee McKay McKinney McLean McMillan Meadows Merrick Middleton
Millard Mitchell Monroe Montgomery Moody Moran Morrison Morrow Mullen Murdock Murphy Murray Nash Nelson Newell
Newman Nichols Nolan Norris Norton Oakley O'Brien O'Connor O'Neal Osborne Oswald Owens Pace Paxton Payne Pearce
Peyton Phelps Pickett Pierce Pratt Prescott Preston Quigley Quinlan Radcliffe Rafferty Rankin Raymond Redding
Reeves Reilly Rennick Reynolds Rhodes Richter Riddle Rigby Riley Rivers Roark Robbins Rollins Rowan Rowland Rusk
Russell Rutledge Ryan Sanders Sawyer Saxton Schuyler Sheridan Sherman Shepherd Sinclair Slater Spencer Stafford
Stanton Stapleton Sterling Stewart Stockton Stratton Sullivan Sutherland Swanson Talbot Tanner Tate Tatum Teague
Thatcher Thorne Thornton Tilden Tolliver Townsend Tracy Travis Trent Tucker Tyler Underwood Upton Vance Vaughn Wade
Wagner Walden Waller Walsh Walters Warren Watkins Weaver Webb Weeks Wells Wendell Whitfield Whitley Wilkins Willard
Winslow Winters Wolfe Woodard Woodson Wright Wyatt Yates York Young Zimmer Ashworth Bancroft Birch Calloway
Cartwright Dunmore Easton Fairbanks Garland Halsey Kimball Langley Millbrook Nightingale Pemberton Quill Ridley
Stoddard Tennyson Whitmore Wickham Yardley
`);

const LAST_BLACK_AMERICAN = words(`
Abernathy Bankston Battle Beasley Bell Bogan Bolden Bridges Brockington Burrell Capers Chaney Cleveland Coleman Cobb
Dandridge Deshields Dorsey Drayton Dunbar Epps Fields Gaines Gaither Gibson Gilliam Goins Gresham Grimes Hairston
Hargrove Haywood Holloway Ivory Jeter Kersey Lattimore Lovett Mabry Mapp Mayfield Mims Mosley Nixon Pettway Pinkney
Poindexter Pullen Rainey Rawls Redmond Rucker Satterfield Spivey Tolbert Truesdale Vinson Waddell Washington Yancey
Applewhite Barnette Brightwell Bynum Cade Chisolm Colbert Crenshaw Dabney Dixon Duckett Eady Eubanks Fortune
Gadsden Gamble Hairston Hawthorne Hightower Holiday Hollis Jernigan Kimbrough Lanier Leake Lofton Marbury Merriweather
Moultrie Nesbitt Odom Peebles Pegues Pruitt Quarles Ravenel Roundtree Sapp Simmons Spruill Strickland Tillman Toney
Tubbs Vance Whitlock Wiggins Wimberly Winfrey Witherspoon Yarbrough Brewton Cuffee Ellerbe Fludd Gist Hatcher
`);

const LAST_LATINO = words(`
Acosta Aguilar Alvarado Alvarez Aragon Arellano Ayala Barrera Bautista Becerra Benitez Blanco Bravo Briones
Bustamante Caballero Cabrera Calderon Camacho Campos Cardenas Carrasco Castillo Castro Cervantes Chavez Cisneros
Colon Contreras Cordero Cortes Cruz Cuellar Davila Delgado Diaz Dominguez Duran Escobar Espinoza Estrada Fernandez
Figueroa Flores Fuentes Gallegos Garza Gil Godoy Gomez Gonzales Guerrero Guevara Gutierrez Guzman Herrera Hidalgo
Huerta Ibarra Jimenez Juarez Lara Ledesma Leon Lopez Lozano Luna Macias Maldonado Marquez Medina Mejia Mendez
Mendoza Mercado Miranda Molina Montoya Mora Morales Moreno Munoz Naranjo Navarro Nieves Nunez Ochoa Olivares
Ordonez Orozco Ortega Ortiz Pacheco Padilla Palacios Paredes Pena Perez Pineda Ponce Quintana Quiroz Ramirez Ramos
Rangel Reyes Rios Rivas Rivera Robles Rocha Rojas Romero Rosales Ruiz Salazar Salinas Sandoval Santana Santiago
Serrano Sierra Solis Soto Suarez Tapia Tejada Torres Trevino Trujillo Valdez Valencia Vargas Vasquez Vega Velasco
Velez Vera Villanueva Villarreal Zamora Zapata Zavala Zuniga Almeida Andrade Barbosa Cardoso Carvalho Costa Ferreira
Fonseca Lacerda Lima Moura Nascimento Oliveira Pereira Rezende Ribeiro Sampaio Teixeira Vieira Abreu Quintero
`);

const LAST_EUROPEAN = words(`
Abate Amato Bellini Benedetti Bianchi Bruno Caruso Colombo Conti DeLuca Esposito Fabbri Ferrari Fontana Galli Gallo
Giordano Greco Lombardi Mancini Marino Marchetti Moretti Orsini Palumbo Ricci Rinaldi Romano Rossi Russo Santoro
Silvestri Sorrentino Vitale Zanetti Arnaud Baptiste Beaulieu Belanger Benoit Bernard Boucher Brun Chevalier Clement
Deschamps Dubois Dupont Fontaine Gagnon Girard Lacroix Lefebvre Legrand Marchand Moreau Navarre Pelletier Renaud
Rousseau Sauvage Thibault Toussaint Vasseur Albrecht Bauer Becker Berger Brenner Dietrich Eberhardt Fischer Frei
Gruber Hahn Hartmann Heinrich Hoffman Huber Kaiser Klein Koch Kraus Krueger Lang Lehmann Maier Neumann Otto Reiter
Schmitt Schneider Schulz Stein Vogel Weber Winter Zimmerman Bakker DeVries DeJong Dekker Jansen Mulder Peeters
Visser VanDyke Vermeulen Andersen Bergstrom Eriksson Gustafsson Halvorsen Hansen Holm Jensen Karlsson Larsen
Lindqvist Lundgren Nilsson Olsen Pedersen Sandberg Soderberg Sorensen Strand Thorsen Vikander Antonov Balogh
Bogdanov Dragan Horvat Ivanov Jovanovic Kovac Kovalenko Kowalski Krol Lazar Markovic Nowak Novak Petrov Petrovic
Popescu Romanov Sokolov Stoica Stankovic Szabo Tomic Volkov Wisniewski Yankovic Zielinski Zoric Andreou Georgiou
Karagiannis Nikolaidis Papadakis Stavros Adler Berman Cohen Epstein Friedman Goldberg Katz Levin Rosen Schwartz
Shapiro Weiss Abrahamian Karapetyan Sarkisian Hovsepian Drozdov Gorski Havel Kovacs Mazur Nagy Sedlak Vesely
`);

const LAST_MIDDLE_EAST_SOUTH_ASIAN = words(`
Demir Kaya Yilmaz Aziz Bashir Farouk Haddad Hamdan Hakim Hussein Karim Khalil Mansour Nasser Qureshi Rahman Said
Saleh Samara Shah Sultan Tariq Younis Zaman Zayed Agarwal Banerjee Bhatt Chakraborty Chopra Desai Dutta Ghosh Gupta
Iyer Jain Joshi Kapoor Khanna Krishnan Kulkarni Malhotra Mehta Menon Mishra Mukherjee Nair Patel Pillai Rao Reddy
Saxena Sethi Sharma Singh Sinha Srinivasan Subramanian Trivedi Varma Verma Abbasi Ansari Bhutto Chaudhry Farooqi
Hashemi Jalali Mirza Nazari Rostami Siddiqui Tehrani Yazdani Baig Dar Lodhi Memon Sheikh
`);

const LAST_EAST_SOUTHEAST_ASIAN = words(`
Chang Chen Cheng Chiu Cho Choi Chu Fang Feng Fong Fujita Fukuda Han Hayashi Ho Hong Hsu Huang Ikeda Inoue Ishikawa
Ito Jang Jeong Jin Kang Kato Kawasaki Kim Kimura Ko Kobayashi Kondo Kwon Lau Lee Leung Li Liang Lim Lin Liu Lo Ma
Matsumoto Miyamoto Mori Murakami Nakagawa Nakamura Nam Ng Nguyen Nishimura Noh Oh Okada Ono Ota Pak Park Pham Qian
Ryu Saito Sakamoto Sasaki Sato Seo Shim Shin Song Sun Suzuki Takahashi Tanaka Tang Tran Tsai Uchida Ueda Wang
Watanabe Wei Wong Wu Xu Yamada Yamamoto Yang Yeo Yi Yoon Yoshida Yu Zhang Zhao Zheng Zhou Zhu Aquino Dizon Jacinto
Lacson Magsaysay Pangilinan Santos Soriano Tolentino Bui Dang Do Duong Hoang Huynh Le Ly Vo Vu Phan Truong
Kurosawa Hasegawa Maeda Hirano Fujimoto Ogawa Harada Okamoto Goto Hamada Eto Tamura Yokoyama Kubo Matsuda
`);

const LAST_AFRICAN = words(`
Achebe Adebayo Adeleke Adewale Afolabi Ajayi Akande Akinola Akintola Amadi Anyanwu Asante Bankole Boateng Chukwu
Dlamini Eze Ezeh Gebre Gyasi Hailu Idowu Ikenna Kamara Kamau Keita Kimani Kone Koroma Mbeki Mbah Mensah Mutua
Mwangi Ndiaye Ndlovu Nkosi Nwosu Obi Odum Ogunleye Okafor Okeke Okonkwo Olawale Onyango Osei Owusu Sesay Sow
Tembo Toure Traore Wanjiru Yeboah Zulu Diallo Diop Camara Bah Barry Cisse Coulibaly Dembele Fofana Sanogo Sylla
Togo Abara Adjei Appiah Danso Frimpong Kuffour Quartey Tetteh Abebe Bekele Tadesse Tesfaye Alemu Mekonnen Wolde
Chikwanha Moyo Ncube Sibanda Banda Phiri Mwale Kalu Nwankwo Ugwu Eke Ibe Emeka Madu Opara Nnadi
`);

const LAST_PACIFIC = words(`
Faleolo Fonoti Leota Mahoe Manu Matagi Palelei Pele Tago Taliaoa Tuiasosopo Tupou Vaifale Alapati Kahale Kamaka Keawe
Kekoa Kealoha Makoa Nakoa Pua Akana Aiona Kaneshiro Kahananui Mahelona Naone Paoa Sua Toala Utu Leilua Tafuna
`);

export const LAST_NAMES: string[] = [
  ...new Set([
    ...LAST_ENGLISH,
    ...LAST_BLACK_AMERICAN,
    ...LAST_LATINO,
    ...LAST_EUROPEAN,
    ...LAST_MIDDLE_EAST_SOUTH_ASIAN,
    ...LAST_EAST_SOUTHEAST_ASIAN,
    ...LAST_AFRICAN,
    ...LAST_PACIFIC,
  ]),
];

/**
 * Real, famous people we never want to generate by accident ("first last", lowercase).
 * Matched against every generated name, so a random pairing can't produce one.
 */
export const FAMOUS_NAMES = new Set(
  `michael jordan|lebron james|kobe bryant|kevin durant|stephen curry|magic johnson|larry bird|tim duncan|allen iverson|dirk nowitzki|kawhi leonard|anthony davis|james harden|russell westbrook|chris paul|dwyane wade|paul pierce|kevin garnett|luka doncic|nikola jokic|joel embiid|jayson tatum|jimmy butler|damian lillard|klay thompson|draymond green|kyrie irving|derrick rose|carmelo anthony|tracy mcgrady|vince carter|charles barkley|karl malone|john stockton|patrick ewing|hakeem olajuwon|david robinson|isiah thomas|dennis rodman|scottie pippen|bill russell|wilt chamberlain|jerry west|oscar robertson|julius erving|steve nash|jason kidd|ray allen|reggie miller|grant hill|zion williamson|ja morant|trae young|devin booker|donovan mitchell|anthony edwards|lamelo ball|lonzo ball|jaylen brown|bam adebayo|jrue holiday|kyle lowry|demar derozan|khris middleton|paul george|blake griffin|kemba walker|john wall|rajon rondo|chris bosh|yao ming|pau gasol|manu ginobili|tony parker|shaquille oneal|ben simmons|karl towns|rudy gobert|domantas sabonis|jalen brunson|tyrese haliburton|paolo banchero|scoot henderson|cade cunningham|jalen green|evan mobley|franz wagner|josh giddey|tyrese maxey|desmond bane|michael jackson|barack obama|donald trump|will smith|denzel washington|kanye west|tom brady|tiger woods|serena williams|usain bolt|muhammad ali|mike tyson|jackie robinson|babe ruth|john lennon|paul mccartney|george washington|abraham lincoln|john kennedy|martin luther|malcolm x|elon musk|bill gates|steve jobs`.split('|'),
);

export const HOMETOWNS = [
  'Oakland, CA', 'Baltimore, MD', 'Indianapolis, IN', 'Queens, NY', 'Houston, TX', 'Atlanta, GA',
  'Chicago, IL', 'Philadelphia, PA', 'Detroit, MI', 'Seattle, WA', 'New Orleans, LA', 'Memphis, TN',
  'Compton, CA', 'Akron, OH', 'Raleigh, NC', 'Phoenix, AZ', 'Milwaukee, WI', 'Toronto, ON',
];

export const PERSONALITIES = [
  'cocky', 'quiet', 'loyal', 'hot-headed', 'funny', 'ambitious', 'jealous', 'humble', 'calculating',
  'warm', 'stubborn', 'perfectionist', 'laid-back', 'intense', 'protective', 'flashy', 'wise', 'sarcastic',
];
