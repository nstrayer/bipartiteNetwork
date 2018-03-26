HTMLWidgets.widget({

  name: 'bipartiteNetwork',

  type: 'output',

  factory: function(el, width, height) {

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

    // construct mesh for the edges between nodes
    function buildEdges(data, constants){
      const geometry = new THREE.BufferGeometry(),
            num_edges = data.edges.length,
            edge_locations = new Float32Array(num_edges*6),
            edge_material = new THREE.LineBasicMaterial( {
              color: constants.colors.edge,
              opacity: constants.misc.edge_opacity,
              transparent: true,
              linewidth: constants.sizes.edge_width,
            } );

      for(let i=0; i<num_edges; i++){
        // get vertex ids for start and end of edge
        const {from, to} = data.edges[i];
        const {x:xs,y:ys,z:zs} = data.vertices[from - 1];
        const {x:xe,y:ye,z:ze} = data.vertices[to - 1];

        // fill in edge locations
        edge_locations[i*6]     = xs;
        edge_locations[i*6 + 1] = ys;
        edge_locations[i*6 + 2] = zs;

        edge_locations[i*6 + 3] = xe;
        edge_locations[i*6 + 4] = ye;
        edge_locations[i*6 + 5] = ze;
      }

      // send locations vector to the geometry buffer.
      geometry.addAttribute( 'position', new THREE.BufferAttribute( edge_locations, 3 ) );

      return new THREE.LineSegments( geometry, edge_material);
    }

    // construct mesh for the nodes.
    function buildNodes(data, plot_colors, constants){
      // fill in a blank geometry object with the vertices from our points
      const geometry = new THREE.BufferGeometry(),
            num_points = data.vertices.length,
            point_locations = new Float32Array(num_points*3),
            point_colors = new Float32Array(num_points*3),
            point_sizes = new Float32Array(num_points),
            point_material = makeNodeMaterial(constants);

      for (let i = 0; i < num_points; i ++ ) {
        const vertex = data.vertices[i];

        // place the point
        point_locations[i*3]     = vertex.x;
        point_locations[i*3 + 1] = vertex.y;
        point_locations[i*3 + 2] = vertex.z;

        // color the point
        const {r,g,b} = plot_colors[vertex.hub ? 'hub' : vertex.subtype ? 'subtype': 'point'];
        point_colors[i*3]     = r;
        point_colors[i*3 + 1] = g;
        point_colors[i*3 + 2] = b;

        // and size it...
        point_sizes[i] = vertex.hub ? constants.sizes.hub_size: constants.sizes.point_size;
      }

      geometry.addAttribute('position', new THREE.BufferAttribute( point_locations, 3 ) );
      geometry.addAttribute('color',    new THREE.BufferAttribute( point_colors,    3 ) );
      geometry.addAttribute('size',     new THREE.BufferAttribute( point_sizes,     1 ) );

      // need to run this so we get a center to aim our camera at.
      geometry.computeBoundingSphere();

      // wrap geometry in material and return along with center
      return new THREE.Points(geometry, point_material);
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
    function setupCamera(camera_consts){
      const camera = new THREE.PerspectiveCamera();

      // setup camera with constants
      for(let setting in camera_consts.setup){
        camera[setting] = camera_consts.setup[setting];
      }
      // update projection matrix to apply changes in settings
      camera.updateProjectionMatrix();

      // position camera
      const sp = camera_consts.start_pos;
      camera.position.set(sp.x,sp.y,sp.z);

      // point camera at center of the network
      const cnt = camera_consts.center;
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

    class phewasNetwork{
      constructor(el, width, height) {

        this.constants = ({
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
            point_size: 0.02,
            hub_size: 0.08,
            selection_size_mult: 3,
            edge_width: 0.008,
            raycast_res: 0.01,
          },
          camera: {
            setup: {
              fov: 65,              // Field of view
              aspect: width/height,
              near: 0.1,            // object will get clipped if they are closer than 1 world unit
              far: 1000,            // and will fade away if they are further than 1000 units away
            },
            start_pos: { x: 1.2, y: 1.2, z: 1.2 },
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
        });


        // Holds current mouse position for point selection.
        this.mouse = new THREE.Vector2(100,100);
        this.width = width;
        this.height = height;

        // --------------------------------------------------------------
        // Start up the rendering engine and append it to our div.
        // --------------------------------------------------------------
        this.renderer = makeRenderer({el, width, height});

        // setup resizing behavior
        window.addEventListener( 'resize', () => this.resize(), false );
      }

      // sets mouse location for the scene for interaction with raycaster/
      onMouseOver(event){
        this.mouse.x =   (event.clientX / this.width)  * 2 - 1;
        this.mouse.y = - (event.clientY / this.height) * 2 + 1;
        // console.log(`x: ${this.mouse.x} | y: ${this.mouse.y}`);
      }

      // actual render function. This gets called repeatedly to update viz
      render(data){
        // request to run function again at next interval
        requestAnimationFrame(() => this.render());

        // update our raycaster with current mouse position
        this.raycaster.setFromCamera( this.mouse, this.camera );

        // figure out what points it intersects
        const intersects = this.raycaster.intersectObject( this.nodes );

        // expand vertice if selected.
        if(this.constants.misc.interactive){
          if(intersects.length > 0){
            this.selectResetNodes([intersects[0].index]);
          } else {
            this.selectResetNodes();
          }
        }

        // Grab new position from controls
        this.controls.update();

        // actually draw to the screen!
        this.renderer.render(this.scene, this.camera);
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

      // gets called once data has arrived to set all data driven parts of the chart.
      drawPlot({data, settings}){
        // --------------------------------------------------------------
        // Extract data passed from R into nice object form
        // --------------------------------------------------------------
        this.data = data;

        //debugger;
        // Overwrite default constants if R supplies new ones.
        for(let section in this.constants){
          Object.assign(this.constants[section], settings[section]);
        }

        const constants = this.constants;

        // Initialize a color object for later node coloring.
        this.plot_colors = makePlotColors(constants.colors);

        // --------------------------------------------------------------
        // Set up edges between cases and hubs
        this.edges = buildEdges(data, constants);
        // --------------------------------------------------------------
        // Set up points/nodes representing cases and hubs
        this.nodes = buildNodes(data, this.plot_colors, constants);
        // --------------------------------------------------------------
        // Initialize the 'scene' and add our geometries we just made
        this.scene = setupScene(this.plot_colors, this.nodes, this.edges);
        // --------------------------------------------------------------
        // Setup camera to actually see our scene. Point it at middle of network
        this.camera = setupCamera(constants.camera);
        // --------------------------------------------------------------
        // Raycaster for selecting points.
        this.raycaster = makeRaycaster(constants);
        // setup a mousemove event to keep track of mouse position for raycaster.
        document.addEventListener( 'mousemove', this.onMouseOver.bind(this), false );
        // --------------------------------------------------------------
        // Attach some controls to our camera and renderer
        this.controls = setupControls(this.camera, this.renderer, constants);
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

      toggleInteraction(){
        this.constants.misc.interactive = !this.constants.misc.interactive;
      }

      // will highlight and expand a group of nodes or if passed nothing will reset to defaults
      selectResetNodes(indices = []){
        // check if we're selecting nodes or resetting them,
        // this determines the length of our size/color setting loop.
        const selecting = indices.length > 0,
              loopLength = selecting ? indices.length: this.data.vertices.length,
              color_attributes = this.nodes.geometry.attributes.color.array,
              size_attributes = this.nodes.geometry.attributes.size.array;

        for(let i=0; i<loopLength; i++){
          const index = selecting ? indices[i]: i,
                [color, size] = this.colorSizeChooser(this.data.vertices[index], selecting);

          color_attributes[index*3]     = color.r;
          color_attributes[index*3 + 1] = color.g;
          color_attributes[index*3 + 2] = color.b;
          size_attributes[index] = size;
        }

        this.nodes.geometry.attributes.color.needsUpdate = true;
        this.nodes.geometry.attributes.size.needsUpdate = true;
      }
    }

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
