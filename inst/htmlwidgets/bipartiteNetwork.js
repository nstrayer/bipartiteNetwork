// build custom shader material for nodes to avoid using sprites.
function makeNodeMaterial(constants){
  // --------------------------------------------------------------
  // Set up custom shaders/materials
  // --------------------------------------------------------------
  const node_vertex_shader= `
attribute float size;
varying vec3 vColor;
void main() {
vColor = color;
vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
gl_PointSize = size * ( 300.0 / -mvPosition.z );
gl_Position = projectionMatrix * mvPosition;
}`;

  const outline_fill = constants.node_outline_black ? 0.0: 1.0;
  const node_fragment_shader = `
varying vec3 vColor;
void main() {
float pct = distance(gl_PointCoord,vec2(0.5));
gl_FragColor = vec4(pct > 0.4 ? vec3(${outline_fill}): vColor, pct < 0.5 ? 1.0: 0.0);
}`;

  return  new THREE.ShaderMaterial( {
    vertexShader: node_vertex_shader,
    fragmentShader: node_fragment_shader,
    depthTest: false,
    transparent: true,
    vertexColors: true
  } );
}

 // builds out renderer object and appends it to the correct place.
function makeRenderer({el, width, height}){
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setSize(width, height);   // setup renderer for our viz size
  renderer.setPixelRatio(window.devicePixelRatio);   // retina ftw
  el.appendChild( renderer.domElement );
  return renderer;
}

// returns typed array for the buffer geometry position
function generate_edge_positions(nodes, links){
  const num_edges = links.length;
  const edge_locations = new Float32Array(num_edges*6);

  for(let i=0; i<num_edges; i++){
    // get vertex ids for start and end of edge
    const link = links[i];
    const source = link.source.index;
      const target = link.target.index;
      const {cx:xs,cy:ys,cz:zs} = nodes[source];
      const {cx:xe,cy:ye,cz:ze} = nodes[target];

      // fill in edge locations
      edge_locations[i*6]     = xs;
      edge_locations[i*6 + 1] = ys;
      edge_locations[i*6 + 2] = zs;

      edge_locations[i*6 + 3] = xe;
      edge_locations[i*6 + 4] = ye;
      edge_locations[i*6 + 5] = ze;

  }
  return edge_locations;
}

// same but for the nodes/points
function generate_point_attributes(nodes, plot_colors, constants){
  const num_points = nodes.length,
        color = new THREE.Color(),
        point_locations = new Float32Array(num_points*3),
        point_colors = new Float32Array(num_points*3),
        point_sizes = new Float32Array(num_points);
  let vertex;


  for (let i = 0; i < num_points; i ++ ) {
    vertex = nodes[i];
    point_locations[i*3]     = vertex.cx;
    point_locations[i*3 + 1] = vertex.cy;
    point_locations[i*3 + 2] = vertex.cz;

    // color the point
    const {r,g,b} = plot_colors[vertex.hub ? 'hub' : vertex.subtype ? 'subtype': 'point'];
    point_colors[i*3]     = r;
    point_colors[i*3 + 1] = g;
    point_colors[i*3 + 2] = b;

    // and sizes...
    point_sizes[i] = vertex.hub? constants.sizes.hub_size: constants.sizes.point_size;
  }
  return {locations: point_locations, colors: point_colors, sizes: point_sizes};
}

// construct mesh for the edges between nodes
function buildEdges(nodes, links, constants){
  const geometry = new THREE.BufferGeometry(),
        edge_locations = generate_edge_positions(nodes, links),
        material = new THREE.LineBasicMaterial( {
          color: constants.colors.edge,
          opacity: constants.misc.edge_opacity,
          transparent: true,
          linewidth: constants.sizes.edge_width,
        } );

  // send locations vector to the geometry buffer.
  geometry.addAttribute( 'position', new THREE.BufferAttribute( edge_locations, 3 ) );

  return new THREE.LineSegments( geometry, material);
}

// construct mesh for the nodes.
function buildNodes(nodes, plot_colors, constants){
  // fill in a blank geometry object with the vertices from our points
  const geometry = new THREE.BufferGeometry(),
        {locations, colors, sizes} = generate_point_attributes(nodes, plot_colors, constants);
        material = makeNodeMaterial(constants);

  geometry.addAttribute('position', new THREE.BufferAttribute( locations, 3 ) );
  geometry.addAttribute('color',    new THREE.BufferAttribute( colors,    3 ) );
  geometry.addAttribute('size',     new THREE.BufferAttribute( sizes,     1 ) );

  // need to run this so we get a center to aim our camera at.
  geometry.computeBoundingSphere();

  // wrap geometry in material and return along with center
  return new THREE.Points(geometry, material);
}

// sets up three scene with the nodes and edges
function setupScene(plot_colors, nodes, edges){
  const scene = new THREE.Scene();

  // color of the background of the visualization
  scene.background = plot_colors.background;

  // add components of the network to the scene
  scene.add(nodes);
  scene.add(edges);
  return scene;
}

// sets up camera with supplied constants.
function setupCamera(settings){
  const camera = new THREE.PerspectiveCamera();

  // setup camera with constants
  for(let setting in settings.setup){
    camera[setting] = settings.setup[setting];
  }
  // update projection matrix to apply changes in settings
  camera.updateProjectionMatrix();

  // position camera
  const sp = settings.start_pos;
  camera.position.set(sp.x,sp.y,sp.z);

  // point camera at center of the network
  const cnt = settings.center;
  camera.lookAt(new THREE.Vector3(cnt.x,cnt.y,cnt.z));

  return camera;
}

// controls
function setupControls(camera, renderer, constants){
  const controls = new THREE.OrbitControls(camera, renderer.domElement);

  // assign settings to controls
  for(let setting in constants.controls){
    controls[setting] = constants.controls[setting];
  }

  const cnt = constants.camera.center;
  controls.target.set( cnt.x,cnt.y,cnt.z );

  return controls;
}

// raycaster with given resolution
function makeRaycaster(constants){
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = constants.sizes.raycast_res;
  return raycaster;
}

// makes a three friendly plot colors object
function makePlotColors(colors){
  const plot_colors = {};
  for (let type in colors){
    plot_colors[type] = new THREE.Color(colors[type]);
  }
  return plot_colors;
}

// setup the 3d simulation code
function setupSimulation(nodes, links, strength = -1){
  return d3.forceSimulation()
    .numDimensions(3)
    .nodes(nodes)
    .force("link",
      d3.forceLink(links)
        .id(d => d.id)
        //.strength(0.05)
    )
    .force("charge",
      d3.forceManyBody()
        .strength(strength)
    )
    .stop();
}


class phewasNetwork{
  constructor(el, width, height){
    this.width = width;
    this.height = height;

    this.constants = {
      colors: {
        background: 'black',
        point: 0x8da0cb,
        selected_point:'red',
        hub: 0x66c2a5,
        selected_hub:'green',
        subtype: 0xfc8d62,
        selected_subtype: 'purple',
        edge: 0xbababa,
      },
      sizes: {
        point_size: 0.1,
        hub_size: 0.3,
        selection_size_mult: 3,
        edge_width: 0.008,
        raycast_res: 0.01,
      },
      camera: {
        setup: {
          fov: 65,              // Field of view
          aspect: width/height,
          near: 0.1,            // object will get clipped if they are closer than 1 world unit
          far: 100,            // and will fade away if they are further than 1000 units away
        },
        start_pos: { x: 1.2, y: 1.2, z: 2 },
        center: { x: 0.5, y: 0.5, z: 0.5 }
      },
      controls: {
        enableDamping:true,      // For that slippery Feeling
        dampingFactor:0.12,      // Needs to call update on render loop
        rotateSpeed:0.08,        // Rotate speed
        panSpeed: 0.05,
        autoRotate:true,        // turn this guy to true for a spinning camera
        autoRotateSpeed:0.2,    // 30
        mouseButtons: {
          ORBIT: THREE.MOUSE.RIGHT,
          ZOOM: THREE.MOUSE.MIDDLE,
          PAN: THREE.MOUSE.LEFT
        },
      },
      misc: {
        node_outline_black: true,
        edge_opacity: 0.1,
        interactive: false,
      }
    };

    // setup vector for holding mouse position for raycaster
    this.mouse = new THREE.Vector2(100, 100);

    // scales to normalize projections to avoid messing with camera.
    this.x_scale = d3.scaleLinear().range([-1,1]);
    this.y_scale = d3.scaleLinear().range([-1,1]);
    this.z_scale = d3.scaleLinear().range([-1,1]);

    // node and link data holders
    this.nodes = [];
    this.links = [];
    this.node_mesh = null;
    this.link_mesh = null;

    // keep track of iteration so we can stop simulation eventually
    this.iteration = 0;
    this.max_iterations = 1;

    // initialize the renderer since it doesn't need anything passed to it to start
    this.renderer = makeRenderer({el, width, height});
  }

  // sets mouse location for the scene for interaction with raycaster
  onMouseOver(event){
    this.mouse.x =   (event.clientX / this.width)  * 2 - 1;
    this.mouse.y = - (event.clientY / this.height) * 2 + 1;
  }

  // brings projection into a -1,1 range for ease of viewing.
  normalize_projection(){
    this.x_scale.domain(d3.extent(this.nodes, d => d.x));
    this.y_scale.domain(d3.extent(this.nodes, d => d.y));
    this.z_scale.domain(d3.extent(this.nodes, d => d.z));

    this.nodes.forEach(node => {
      node.cx = this.x_scale(node.x);
      node.cy = this.y_scale(node.y);
      node.cz = this.z_scale(node.z);
    });
  }

  updateMeshes(){
    // generate the new attribute vectors for the point and line meshes
    const {locations: p_l, colors: p_c, sizes: p_s} = generate_point_attributes(this.nodes, this.plot_colors, this.constants)
    const e_l = generate_edge_positions(this.nodes, this.links);

    this.node_mesh.geometry.attributes.position.array = p_l;
    this.node_mesh.geometry.attributes.color.array = p_c;
    this.node_mesh.geometry.attributes.size.array = p_s;
    this.node_mesh.geometry.attributes.position.needsUpdate = true;
    this.node_mesh.geometry.attributes.color.needsUpdate = true;
    this.node_mesh.geometry.attributes.size.needsUpdate = true;
    this.node_mesh.geometry.computeBoundingSphere();

    this.link_mesh.geometry.attributes.position.array = e_l;
    this.link_mesh.geometry.attributes.position.needsUpdate = true;
  }

  colorSizeChooser({hub, subtype}, selected){
      const colors = this.plot_colors,
            sizes = this.constants.sizes;

      let color, size;

      if(hub){
        color = colors[`${selected?'selected_':''}hub`];
        size = sizes['hub_size'];
      } else {
        color = colors[`${selected?'selected_':''}${subtype?'subtype':'point'}`];
        size = sizes['point_size'];
      }
      if(selected){
        size *= sizes.selection_size_mult;
      }
      return [color, size];
    }

  // main render function. This gets called repeatedly
  render(){
    // request animation frame for continued running
    requestAnimationFrame(() => this.render());

    if(this.iteration < this.max_iterations){
      // run instances of our layout simulation
      this.simulation.tick();

      // normalize the data after layout step
      this.normalize_projection();

      // update mesh attributes.
      this.updateMeshes();

      this.iteration += 1;
    }

    // update our raycaster with current mouse position
    //this.raycaster.setFromCamera( this.mouse, this.camera );
    //// figure out what points it intersects
    //const intersects = this.raycaster.intersectObject( this.nodes );
    //// expand vertice if selected.
    //if(this.constants.misc.interactive){
    //  if(intersects.length > 0){
    //    this.selectResetNodes([intersects[0].index]);
    //  } else {
    //    this.selectResetNodes();
    //  }
    //}


    // Grab new position from controls (if user has dragged, etc)
    this.controls.update();

    // actually draw to the screen!
    this.renderer.render(this.scene, this.camera);
  }

  // function called to kick off visualization with data.
  drawPlot({data, settings}){

    // check if we've already got a scene going
    if(this.node_mesh){
      this.node_mesh.dispose()
      this.link_mesh.dispose()
    }

    // extract node and link data
    this.nodes = data.vertices.map(d => ({
      id: d.index,
      hub: d.hub,
      subtype: d.subtype
    }));
    this.links = data.edges.map(d => ({source: d.from, target: d.to}));

    this.max_iterations = settings.max_iterations || 50;

    // Overwrite default constants if R supplies new ones.
    for(let section in this.constants){
      Object.assign(this.constants[section], settings[section]);
    }

    // Initialize a color object for later node coloring.
    this.plot_colors = makePlotColors(this.constants.colors);

    // initialize our simulation object and perform one iteration to get link data in proper form
    this.simulation = setupSimulation(this.nodes, this.links, settings.force_strength);
    this.simulation.tick();

    // Building the visualization
    // --------------------------------------------------------------
    // Set up edges between cases and hubs
    this.link_mesh = buildEdges(this.nodes, this.links, this.constants);
    // --------------------------------------------------------------
    // Set up points/nodes representing cases and hubs
    this.node_mesh = buildNodes(this.nodes, this.plot_colors, this.constants);
    // --------------------------------------------------------------
    // Initialize the 'scene' and add our geometries we just made
    this.scene = setupScene(this.plot_colors, this.node_mesh, this.link_mesh);
    // --------------------------------------------------------------
    // Setup camera to actually see our scene. Point it at middle of network
    this.camera = setupCamera(this.constants.camera);
    // --------------------------------------------------------------
    //// Raycaster for selecting points.
    //this.raycaster = makeRaycaster(this.constants);
    //// setup a mousemove event to keep track of mouse position for raycaster.
    //document.addEventListener( 'mousemove', this.onMouseOver.bind(this), false );
    //// --------------------------------------------------------------
    // Attach some controls to our camera and renderer
    this.controls = setupControls(this.camera, this.renderer, this.constants);
    // --------------------------------------------------------------
    // Run the renderer!
    this.render();
  }

  resize(width, height) {
    this.renderer.setSize(width, height);
    this.width = width;
    this.height = height;
  }

  // turns on and off the autorotating camera
  toggleAutoRotate(){
    this.controls.autoRotate = !this.controls.autoRotate;
  }

  //toggleInteraction(){
  //  this.constants.misc.interactive = !this.constants.misc.interactive;
  //}

  //// will highlight and expand a group of nodes or if passed nothing will reset to defaults
  //selectResetNodes(indices = []){
  //  // check if we're selecting nodes or resetting them,
  //  // this determines the length of our size/color setting loop.
  //  const selecting = indices.length > 0,
  //        loopLength = selecting ? indices.length: this.data.vertices.length,
  //        color_attributes = this.nodes.geometry.attributes.color.array,
  //        size_attributes = this.nodes.geometry.attributes.size.array;
  //  for(let i=0; i<loopLength; i++){
  //    const index = selecting ? indices[i]: i,
  //          [color, size] = this.colorSizeChooser(this.data.vertices[index], selecting);
  //    color_attributes[index*3]     = color.r;
  //    color_attributes[index*3 + 1] = color.g;
  //    color_attributes[index*3 + 2] = color.b;
  //    size_attributes[index] = size;
  //  }
  //  this.nodes.geometry.attributes.color.needsUpdate = true;
  //  this.nodes.geometry.attributes.size.needsUpdate = true;
  //}


}

HTMLWidgets.widget({

  name: 'bipartiteNetwork',

  type: 'output',

  factory: function(el, width, height) {

    const plot = new phewasNetwork(el, width, height);

    return {

      renderValue: function(x) {

        const data = {
          edges: HTMLWidgets.dataframeToD3(x.data.edges),
          vertices: HTMLWidgets.dataframeToD3(x.data.vertices),
        };

        plot.drawPlot({data, settings: x.settings});

      },

      resize: function(width, height) {
        plot.resize(width, height);
      }

    };
  }
});
