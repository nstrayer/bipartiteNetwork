library(tidyverse)

makeNetworkData <- function(data){
  data_small <- data %>%
    select(-IID, -snp)

  snp_status <- data$snp

  n_phenos <- data_small %>% ncol()
  n_cases <- data_small %>% nrow()

  case_names <- paste('case', 1:n_cases)
  pheno_names <- colnames(data_small) %>% str_remove('pheno_')

  # Turn into igraph object
  graph_obj <- igraph::graph.incidence(data_small, mode=c("all")) %>%
    simplify()

  # Contains the connections between the vertices in from-to form.
  edge_df <- graph_obj %>%
    igraph::as_data_frame(what = 'edges') %>%
    select(from, to)

  # Vertice index and positions, along with if vertex is a phenotype or not
  vertices_df <- data_frame(
    index = 1:(n_phenos + n_cases),
    hub = index > n_cases,
    subtype = c(snp_status, rep(0, n_phenos)) != 0,
    name = c(case_names, pheno_names)
  )


  list(
    edges = edge_df,
    vertices = vertices_df
  )
}
data_location <- here::here('demo/phewas_digger/data/data_w_snp.Rds')

data <- readRDS(data_location) %>% makeNetworkData()


devtools::install()
library(bipartiteNetwork)
bipartiteNetwork(
  data,
  colors = list(background = 'white'),
  controls = list(
    autoRotate = FALSE,
    rotateSpeed = 0.01
 ),
 sizes = list(
   raycast_res = 0.01
 ),
 max_iterations = 200,
 force_strength = -1
)

