/* The Kefalonia–Ithaca seafloor telecom cable used in the 2024 DAS experiment.
   Numbers: README of github.com/WANGYuhan2002/das-channel-mapping-skill and the Kefalonia Transform Fault preprint
   (doi:10.22541/essoar.15006791/v1). The route is digitised by eye from the channel-map figure of that repository:
   good for a drawing, not for science. */
window.YW_CABLE = {
  name: 'Kefalonia–Ithaca seafloor telecom cable',
  place: 'Ionian Sea, Greece',
  experiment: '24 April – 22 June 2024',
  channels: 1872,
  spacing_m: 8.17,
  length_km: 15.29,
  segments: [
    {key: 'cabin', name: 'interrogator & reel', from: 0, to: 40},
    {key: 'land', name: 'Kefalonia, along the coast road', from: 40, to: 900},
    {key: 'coil', name: 'beach manhole', from: 900, to: 925},
    {key: 'sea', name: 'seafloor, Kefalonia–Ithaca strait', from: 925, to: 1760},
    {key: 'ithaca', name: 'Ithaca, land', from: 1760, to: 1872}
  ],
  /* [channel, lon, lat] */
  route: [
    [0, 20.5567, 38.4627], [40, 20.5592, 38.4628], [70, 20.5612, 38.4609], [100, 20.5628, 38.4632],
    [150, 20.5655, 38.4640], [200, 20.5700, 38.4650], [250, 20.5708, 38.4638], [300, 20.5735, 38.4610],
    [350, 20.5745, 38.4592], [400, 20.5772, 38.4590], [450, 20.5792, 38.4572], [500, 20.5805, 38.4537],
    [550, 20.5782, 38.4530], [600, 20.5762, 38.4526], [650, 20.5786, 38.4498], [700, 20.5779, 38.4476],
    [750, 20.5790, 38.4452], [800, 20.5786, 38.4438], [850, 20.5765, 38.4415], [900, 20.5795, 38.4407],
    [925, 20.5800, 38.4405], [1000, 20.5870, 38.4393], [1050, 20.5908, 38.4372], [1100, 20.5935, 38.4340],
    [1150, 20.5952, 38.4308], [1200, 20.5978, 38.4284], [1250, 20.6010, 38.4262], [1300, 20.6052, 38.4248],
    [1350, 20.6100, 38.4247], [1400, 20.6150, 38.4255], [1450, 20.6205, 38.4274], [1500, 20.6260, 38.4296],
    [1550, 20.6302, 38.4312], [1600, 20.6340, 38.4332], [1650, 20.6372, 38.4358], [1700, 20.6400, 38.4385],
    [1760, 20.6420, 38.4397], [1800, 20.6432, 38.4412], [1872, 20.6448, 38.4438]
  ],
  telecom_node: [20.6458, 38.4455],
  /* spare fibre stored along the road: many channels at one point on the ground */
  coils: [
    {from: 246, to: 250, m: 41}, {from: 503, to: 506, m: 33}, {from: 681, to: 683, m: 25},
    {from: 705, to: 707, m: 16}, {from: 750, to: 768, m: 155}, {from: 844, to: 859, m: 131},
    {from: 900, to: 920, m: 172, note: 'beach manhole'}
  ],
  facts: {
    fibre_to_beach_km: 7.32, ground_to_beach_km: 6.44, excess_km: 0.87,
    stored_km: 0.71, stored_points: 8, reel_m: 134
  },
  /* matched-filter result on this cable (preprint, 2026) */
  catalogue: {
    templates: 5, detections: 17325, regional_catalogue: 893, ratio: 'nearly 20×',
    largest_cluster_share: '> 72 %', mc_gain: '≈ 2 magnitude units', days: 'two months'
  }
};
