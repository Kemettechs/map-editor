import Papa from 'papaparse'

const toCSV = point => {
  return [
    ...point.geometry.coordinates.reverse(),
    ...Object.values(point.properties)
  ]
}

self.addEventListener('message', function (e) {
    try {
      const points = e.data.encode
      const encoded = Papa.unparse(points.map(point => toCSV(point)))

      self.postMessage({ encoded });
    } catch (err) {
      self.postMessage({ error: 'Unable to encode the file: ' + err });
    }
});
