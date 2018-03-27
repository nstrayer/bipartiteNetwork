library(tidyverse)
data <- readRDS('data/graph_info.Rds')

# data$vertices <- data$vertices %>%
#   select(-x,-y,-z)

devtools::install()
library(bipartiteNetwork)
bipartiteNetwork(
  data,
  colors = list(background = 'white'),
  controls = list(
    autoRotate = FALSE,
    rotateSpeed = 0.01
 ),
 max_iterations = 200,
 force_strength = -1
)

