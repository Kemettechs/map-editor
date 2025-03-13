import Papa from "papaparse";

self.addEventListener("message", function (e) {
  // console.log(e.data.decode);
  try {
    let csvString = e.data.decode;
    let parsedCSV = Papa.parse(csvString);

    // exclude all lines without the first element present (usually a blank line)
    let parsedLines = parsedCSV.data.filter((l) => l[0]?.length);
    // console.log(parsedLines);
    var points = parsedLines.map((line) => {
      let group;
      let [lat, lng, prop1, prop2, prop3] = line;
      if (lat == "NEWGROUP") {
        group = "NEWGROUP";
      }
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat].map(parseFloat),
        },
        properties: {
          group,
          prop1,
          prop2,
          prop3,
        },
      };
    });

    self.postMessage({ decoded: { points } });
  } catch (err) {
    self.postMessage({ error: "Unable to decode selected file: " + err });
  }
});
