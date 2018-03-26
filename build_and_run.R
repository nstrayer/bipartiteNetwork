data <- readRDS('data/graph_info.Rds')

devtools::install()
library(bipartiteNetwork)
bipartiteNetwork(
  data,
  colors = list(background = 'white'),
  controls = list(
    autoRotate = TRUE,
    rotateSpeed = 0.01
 )
)
