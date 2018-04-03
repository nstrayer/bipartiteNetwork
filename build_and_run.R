library(tidyverse)

data <- readRDS(here::here('demo/phewas_digger/data/data_w_snp.Rds'))
phecode_info <- readRDS(here::here('demo/phewas_digger/data/phewas_data.rds'))

# Make a standardized color pallete for the phenotype categories
makeDescriptionPalette <- function(phecode_info){
  unique_descriptions <- phecode_info$description %>% unique()

  data_frame(
    description = unique_descriptions,
    color = randomcoloR::distinctColorPalette(length(unique_descriptions))
  )
}

color_palette <- makeDescriptionPalette(phecode_info)

makeNetworkData <- function(data, phecode_info, color_palette, normal_case_color = 'steelblue', snp_color = 'orangered'){
  data_small <- data %>%
    select(-IID, -snp)

  snp_status <- data$snp

  n_phenos <- data_small %>% ncol()
  n_cases <- data_small %>% nrow()

  case_names <- paste('case', 1:n_cases)
  pheno_names <- colnames(data_small) %>% str_remove('pheno_')

  code_to_color <- data_frame(name = pheno_names) %>%
    mutate(code_numeric = as.numeric(name)) %>%
    left_join(phecode_info %>% select(code_numeric, description), by = 'code_numeric') %>%
    inner_join(color_palette, by = 'description') %>%
    select(name, color)


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
  ) %>%
    left_join(code_to_color, by = c('name')) %>%
    mutate(color = case_when(
      !is.na(color) ~ color,
      (!hub & !subtype) ~ normal_case_color,
      TRUE ~ snp_color
    ))


  list(
    edges = edge_df,
    vertices = vertices_df
  )
}

network_data <- data %>% makeNetworkData(phecode_info, color_palette)

devtools::install()
library(bipartiteNetwork)
bipartiteNetwork(
  network_data,
  colors = list(background = 'white'),
  controls = list(
    autoRotate = FALSE,
    rotateSpeed = 0.05
  ),
  sizes = list(
    raycast_res = 0.05
  ),
  misc = list(
    interactive = TRUE,
    max_iterations = 50,
    manybody_strength = -2
  )
)

