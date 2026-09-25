function notFound(_req, res) {
  res.status(404).render('404', { title: 'Page not found | Maison Atelier' });
}

module.exports = notFound;
