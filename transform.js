const fs = require("fs");
const { promisify } = require("util");
const ejs = require("ejs");
const texts = require("./text");
const csv = require("csvtojson");

const readDir = promisify(fs.readdir);
const read = promisify(fs.readFile);
const write = promisify(fs.writeFile);

const VIEW_FILE = __dirname + "/index.ejs";
const DRS_DIR = __dirname + "/drs";

const langToFileName = (lang) =>
  lang === "PL" ? "index.html" : "index_en.html";

const drProps = ["Miasto", "Kontakt"];

const validateDoctor = (dr) =>
  drProps.reduce((acc, prop) => {
    return acc && dr[prop] != null && dr[prop] != "";
  }, true);

const makeCsv = () =>
  csv({
    delimiter: ",",
    includeColumns:
      /(Miasto|Nazwa\/Imię i Nazwisko|Szpital\/klinika|Adres|Kontakt)/,
  });

const processProfession = (drFile) =>
  makeCsv()
    .fromFile(`${DRS_DIR}/${drFile}`)
    .then((drs) =>
      drs.flatMap((dr) => ({ ...dr, prof: drFile.replace(".csv", "") }))
    );

const reduceByCity = (drs) =>
  drs.reduce(
    (acc, { Miasto: city, prof, ...rest }) => {
      if (!acc.details[city]) {
        acc.cities.push(city);
        acc.details[city] = {};
      }

      if (!acc.details[city][prof]) {
        acc.details[city][prof] = [];
      }

      acc.details[city][prof].push(rest);

      return acc;
    },
    { cities: [], details: {} }
  );

const processDoctors = () =>
  readDir(DRS_DIR)
    .then((drsFiles) => drsFiles.map(processProfession))
    .then((execs) => Promise.all(execs))
    .then((profs) => profs.flatMap((p) => p))
    .then((drs) => drs.filter(validateDoctor))
    .then(reduceByCity);

const translationObj = (text, cities) =>
  Object.assign({}, { text }, { p6: { offices: cities } });

const writeTranslations = () =>
  processDoctors().then(({ cities, details }) =>
    read(VIEW_FILE, "utf-8")
      .then((index) => [
        ejs.render(index, translationObj(texts.PL, cities)),
        ejs.render(index, translationObj(texts.EN, cities)),
      ])
      .then(([pl, en]) =>
        Promise.all([
          write(
            __dirname + "/public/drs.json",
            JSON.stringify(details, null, 2)
          ),
          write(__dirname + `/public/${langToFileName("PL")}`, pl),
          write(__dirname + `/public/${langToFileName("EN")}`, en),
        ])
      )
  );

writeTranslations();