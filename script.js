import * as THREE from
    "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";


import { OrbitControls } from
    "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";


/* ============================================================
 *
 * GLOBALS
 *
 * ============================================================ */


const consoleInput = document.getElementById("consoleInput");
const consoleOutput = document.getElementById("consoleOutput");
const consoleExecute = document.getElementById("executeCommand");
const pythonFileInput = document.getElementById("pythonFileInput");
const ui = document.getElementById("ui");
const codeInspector = document.getElementById("codeInspector");
const codeInspectorTitle = document.getElementById("codeInspectorTitle");
const codeInspectorContent = document.getElementById("codeInspectorContent");
const pushCodeModification = document.getElementById("pushCodeModification");
const viewer = document.getElementById("viewer");
const modelInfo = document.getElementById("modelInfo");
const cameraInfo = document.getElementById("cameraInfo");
const errorElement = document.getElementById("error");
const geminiApiKey =
    "AQ.Ab8RN6KDjiwVPz62OpypCJhDcqdO4weg8NatfhS-UJDbn0p1BA";
const geminiTtsEndpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
let modelData = null;
let texture = null;
let tableData = null;
let tableTexture = null;
let daggerData = null;
let daggerObject = null;
let daggerTexture1 = null;
let daggerTexture2 = null;
let modelRoot = new THREE.Group();
let pythonExecutionId = 0;
let scriptVariables = {};
let storedScripts = {};
const armJoints = {};
const thumbJoints = {};
const grabbableObjects = [];

/*
 * Joint rotation limits.
 *
 * Every joint axis is limited to a total range of 180 degrees:
 * -90 degrees through +90 degrees.
 *
 * Three.js stores Euler rotations in radians, so all limits are
 * converted to radians once here.
 */
const JOINT_MIN_ROTATION =
    THREE.MathUtils.degToRad(-90);

const JOINT_MAX_ROTATION =
    THREE.MathUtils.degToRad(90);

function clampJointRotation(
    angle
) {
    return THREE.MathUtils.clamp(
        angle,
        JOINT_MIN_ROTATION,
        JOINT_MAX_ROTATION
    );
}

function clampJoint(
    joint
) {
    if (!joint) {
        return;
    }

    joint.rotation.x =
        clampJointRotation(
            joint.rotation.x
        );

    joint.rotation.y =
        clampJointRotation(
            joint.rotation.y
        );

    joint.rotation.z =
        clampJointRotation(
            joint.rotation.z
        );
}
const groupHighlightLines = [];
const groupHighlightMaterial =
    new THREE.LineBasicMaterial({
        color: 0xff0000,
        depthTest: true,
        depthWrite: true,
        toneMapped: true
    });
const waveClock = new THREE.Clock();
let lWaveAnimationEnabled = false;
let rWaveAnimationEnabled = false;
let resetAnimation = null;
let eyesLookingRight = false;
let speechAudioContext = null;
const handCanGrab = {
    L: false,
    R: false
};
const handIsHolding = {
    L: false,
    R: false
};
const loadedPythonFiles = new Map();
const scriptedRotations = [];
const scriptedCycles = [];
const activeSpeech = new Set();
const commandHistory = [];
let commandHistoryIndex = -1;
let commandHistoryDraft = "";
let executingPythonFile = null;
let inspectedPythonFile = null;


function positionCodeInspector() {
    codeInspector.style.top =
        `${ui.offsetTop + ui.offsetHeight + 10}px`;
}


positionCodeInspector();


const uiResizeObserver =
    new ResizeObserver(
        positionCodeInspector
    );


uiResizeObserver.observe(
    ui
);


/*
 * Minecraft/Blockbench coordinates are treated as:
 *
 * X = left/right
 * Y = up/down
 * Z = front/back
 *
 * Three.js uses the same handed coordinate convention for
 * this purpose, so no global conversion is necessary.
 */


/* ============================================================
 *
 * SCENE
 *
 * ============================================================ */


const scene =
    new THREE.Scene();


scene.background =
    null;


/* ============================================================
 *
 * CAMERA
 *
 * ============================================================ */


const camera =
    new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.01,
        10000
    );


camera.position.set(25, 20, -25);

camera.lookAt(0, 0, 0);


/* ============================================================
 *
 * RENDERER
 *
 * ============================================================ */


const renderer =
    new THREE.WebGLRenderer({
        antialias: false,
        alpha: true
    });


renderer.setPixelRatio(
    window.devicePixelRatio
);


renderer.setSize(
    window.innerWidth,
    window.innerHeight
);


renderer.outputColorSpace =
    THREE.SRGBColorSpace;


viewer.appendChild(
    renderer.domElement
);


const controls =
    new OrbitControls(
        camera,
        renderer.domElement
    );


controls.enableDamping =
    true;


controls.minDistance =
    15;


controls.maxDistance =
    75;


controls.target.set(
    0,
    0,
    0
);


controls.update();


/* ============================================================
 *
 * LIGHTING
 *
 * ============================================================ */


const ambientLight =
    new THREE.AmbientLight(
        0xffffff,
        0.2
    );


scene.add(
    ambientLight
);


const directionalLight =
    new THREE.DirectionalLight(
        0xffffff,
        3
    );


directionalLight.position.set(
    -10,
    50,
    30
);


scene.add(
    directionalLight
);


/* ============================================================
 *
 * STATIC ASSETS
 *
 * ============================================================ */


const assetCacheVersion =
    Date.now();


function getAssetUrl(
    path
) {

    return `${path}?v=${assetCacheVersion}`;
}


function getDeclaredTexturePath(
    assetData,
    fallbackName
) {

    const declaredTexture =
        assetData?.textures?.["0"] ||
        fallbackName;


    const textureName =
        String(declaredTexture)
            .split("/")
            .pop()
            .replace(/\.(png|jpg|jpeg|webp)$/i, "");


    return getAssetUrl(
        `src/${textureName}.png`
    );
}


async function loadDefaultAssets() {

    try {

        if (window.location.protocol === "file:") {

            modelData =
                await new Promise(
                    (resolve, reject) => {

                        const request =
                            new XMLHttpRequest();

                        request.open(
                            "GET",
                            "src/model.json",
                            true
                        );

                        request.onload =
                            () => {

                                if (request.status === 0 ||
                                    (request.status >= 200 &&
                                        request.status < 300)) {

                                    try {
                                        resolve(
                                            JSON.parse(
                                                request.responseText
                                            )
                                        );
                                    } catch (error) {
                                        reject(error);
                                    }

                                    return;
                                }

                                reject(
                                    new Error(
                                        `Could not load src/model.json (${request.status})`
                                    )
                                );
                            };

                        request.onerror =
                            () => reject(
                                new Error(
                                    "Could not load src/model.json"
                                )
                            );

                        request.send();
                    }
                );
        } else {

            const modelResponse =
                await fetch("src/model.json");


            if (!modelResponse.ok) {
                throw new Error(
                    `Could not load src/model.json (${modelResponse.status})`
                );
            }


            modelData =
                await modelResponse.json();
        }


        if (window.location.protocol === "file:") {

            tableData =
                await new Promise(
                    (resolve, reject) => {

                        const request =
                            new XMLHttpRequest();

                        request.open(
                            "GET",
                            "src/table.json",
                            true
                        );

                        request.onload =
                            () => {

                                if (request.status === 0 ||
                                    (request.status >= 200 &&
                                        request.status < 300)) {

                                    try {
                                        resolve(
                                            JSON.parse(
                                                request.responseText
                                            )
                                        );
                                    } catch (error) {
                                        reject(error);
                                    }

                                    return;
                                }

                                reject(
                                    new Error(
                                        `Could not load src/table.json (${request.status})`
                                    )
                                );
                            };

                        request.onerror =
                            () => reject(
                                new Error(
                                    "Could not load src/table.json"
                                )
                            );

                        request.send();
                    }
                );

        } else {

            const tableResponse =
                await fetch("src/table.json");


            if (!tableResponse.ok) {
                throw new Error(
                    `Could not load src/table.json (${tableResponse.status})`
                );
            }


            tableData =
                await tableResponse.json();
        }


        if (window.location.protocol === "file:") {

            daggerData =
                await new Promise(
                    (resolve, reject) => {

                        const request =
                            new XMLHttpRequest();

                        request.open(
                            "GET",
                            "src/test_dagger.json",
                            true
                        );

                        request.onload =
                            () => {

                                if (request.status === 0 ||
                                    (request.status >= 200 &&
                                        request.status < 300)) {

                                    try {
                                        resolve(
                                            JSON.parse(
                                                request.responseText
                                            )
                                        );
                                    } catch (error) {
                                        reject(error);
                                    }

                                    return;
                                }

                                reject(
                                    new Error(
                                        `Could not load src/test_dagger.json (${request.status})`
                                    )
                                );
                            };

                        request.onerror =
                            () => reject(
                                new Error(
                                    "Could not load src/test_dagger.json"
                                )
                            );

                        request.send();
                    }
                );

        } else {

            const daggerResponse =
                await fetch("src/test_dagger.json");


            if (!daggerResponse.ok) {
                throw new Error(
                    `Could not load src/test_dagger.json (${daggerResponse.status})`
                );
            }


            daggerData =
                await daggerResponse.json();
        }


        const textureLoader =
            new THREE.TextureLoader();


        [texture, tableTexture, daggerTexture1, daggerTexture2] =
            await Promise.all([
                new Promise(
                    (resolve, reject) => {
                        textureLoader.load(
                            getDeclaredTexturePath(
                                modelData,
                                "model-texture"
                            ),
                            resolve,
                            undefined,
                            reject
                        );
                    }
                ),
                new Promise(
                    (resolve, reject) => {
                        textureLoader.load(
                            getAssetUrl(
                                "src/table-texture.png"
                            ),
                            resolve,
                            undefined,
                            reject
                        );
                    }
                ),
                new Promise(
                    (resolve, reject) => {
                        textureLoader.load(
                            getAssetUrl(
                                "src/dagger_texture_1.png"
                            ),
                            resolve,
                            undefined,
                            reject
                        );
                    }
                ),
                new Promise(
                    (resolve, reject) => {
                        textureLoader.load(
                            getAssetUrl(
                                "src/dagger_texture_2.png"
                            ),
                            resolve,
                            undefined,
                            reject
                        );
                    }
                )
            ]);


        for (const assetTexture of [
            texture,
            tableTexture,
            daggerTexture1,
            daggerTexture2
        ]) {
            assetTexture.colorSpace =
                THREE.SRGBColorSpace;


            assetTexture.magFilter =
                THREE.NearestFilter;


            assetTexture.minFilter =
                THREE.NearestFilter;
        }


        errorElement.textContent = "";

        rebuildModel();

    } catch (error) {

        console.error(error);

        errorElement.textContent =
            "Failed to load default assets:\n" +
            error.message;
    }
}


loadDefaultAssets();


/* ============================================================
 *
 * REBUILD MODEL
 *
 * ============================================================ */


function rebuildModel() {

    if (!modelData || !tableData || !daggerData) {
        return;
    }


    clearGroupHighlight();


    /*
     * Remove old model.
     */

    scene.remove(
        modelRoot
    );


    modelRoot =
        new THREE.Group();

    for (
        const jointName of Object.keys(armJoints)
    ) {

        delete armJoints[jointName];
    }

    for (
        const side of Object.keys(thumbJoints)
    ) {
        delete thumbJoints[side];
    }

    grabbableObjects.length = 0;
    daggerObject = null;


    scene.add(
        modelRoot
    );


    const robotRoot =
        buildAsset(
            modelData,
            texture,
            4,
            false,
            [27, 39]
        );


    const tableRoot =
        buildAsset(
            tableData,
            tableTexture,
            8,
            true
        );


    const daggerPlacement =
        new THREE.Group();


    daggerObject = daggerPlacement;
    daggerObject.userData.canGrab =
        daggerData.can_grab === true;


    const daggerRoot =
        buildAsset(
            daggerData,
            [daggerTexture1, daggerTexture2],
            1
        );


    daggerRoot.position.set(
        -8,
        6.0,
        -10
    );


    daggerRoot.scale.setScalar(
        0.5
    );


    daggerPlacement.add(
        daggerRoot
    );


    daggerPlacement.rotation.x =
        Math.PI;


    daggerPlacement.rotation.y =
        THREE.MathUtils.degToRad(
            -45
        );


    daggerPlacement.rotation.z =
        THREE.MathUtils.degToRad(
            -5
        );


    daggerPlacement.position.set(
        15,
        15.5,
        8
    );


    grabbableObjects.push(
        daggerObject
    );


    modelRoot.add(
        robotRoot,
        tableRoot,
        daggerPlacement
    );


    setEyeGaze(
        eyesLookingRight
    );


    /*
     * Center model.
     */

    frameModel();


    /*
     * Update information.

     */

    modelInfo.textContent =
        "Elements: " +
        (modelData.elements || []).length +
        " + table " +
        (tableData.elements || []).length +
        "\nGroups: " +
        (countGroups(modelData.groups || []) +
            countGroups(tableData.groups || []));

}


function buildAsset(
    assetData,
    assetTexture,
    uvScale,
    flipVerticalSideUVs = false,
    flipAllUVs = []
) {

    const assetRoot =
        new THREE.Group();


    const elements =
        assetData.elements || [];


    const groups =
        assetData.groups || [];


    const meshes = [];


    for (
        let i = 0;
        i < elements.length;
        i++
    ) {

        const mesh =
            createCube(
                elements[i],
                assetData,
                assetTexture,
                uvScale,
                flipVerticalSideUVs === true ||
                    flipVerticalSideUVs.includes?.(i),
                flipAllUVs.includes(i)
            );


        mesh.userData.elementIndex =
            i;


        meshes[i] =
            mesh;
    }


    if (groups.length > 0) {

        for (
            const group of groups
        ) {

            buildGroup(
                group,
                assetRoot,
                meshes,
                elements
            );
        }

    } else {

        for (
            const mesh of meshes
        ) {

            assetRoot.add(
                mesh
            );
        }
    }


    return assetRoot;
}


/* ============================================================
 *
 * CREATE CUBE
 *
 * ============================================================ */


function createCube(
    element,
    assetData,
    assetTexture,
    uvScale,
    flipVerticalSideUVs,
    flipAllUVs
) {

    const from =
        element.from;


    const to =
        element.to;


    /*
     * Dimensions.
     */

    const width =
        Math.abs(
            to[0] - from[0]
        );


    const height =
        Math.abs(
            to[1] - from[1]
        );


    const depth =
        Math.abs(
            to[2] - from[2]
        );


    /*
     * Center.
     */

    const center =
        new THREE.Vector3(
            (from[0] + to[0]) / 2,
            (from[1] + to[1]) / 2,
            (from[2] + to[2]) / 2
        );


    /*
     * Create geometry.

     *
     * We use a custom BoxGeometry because every
     * face can have a different Blockbench UV.
     */

    const geometry =
        new THREE.BoxGeometry(
            width,
            height,
            depth
        );


    /*
     * Create six materials:
     *
     * +X = east
     * -X = west
     * +Y = up
     * -Y = down
     * +Z = south
     * -Z = north
     */

    const faces = [
        "east",
        "west",
        "up",
        "down",
        "south",
        "north"
    ];


    const materials = [];


    for (
        const faceName of faces
    ) {

        const face =
            element.faces?.[faceName];


        materials.push(
            createFaceMaterial(
                face,
                assetTexture
            )
        );
    }


    /*
     * Apply the materials.
     */

    const mesh =
        new THREE.Mesh(
            geometry,
            materials
        );


    mesh.position.copy(
        center
    );


    mesh.name =
        element.name ||
        "cube";


    /*
     * Apply the UV coordinates.

     */

    applyFaceUVs(
        geometry,
        element,
        assetData,
        uvScale,
        flipVerticalSideUVs,
        flipAllUVs
    );


    if (
        element.name === "eyeL" ||
        element.name === "eyeR"
    ) {
        mesh.userData.isEye = true;
        mesh.userData.defaultUVs =
            Float32Array.from(
                geometry.attributes.uv.array
            );
    }


    /*
     * Blockbench cube rotation.

     */

    if (element.rotation) {

        applyCubeRotation(
            mesh,
            element.rotation
        );
    }


    return mesh;
}


/* ============================================================
 *
 * FACE MATERIAL
 *
 * ============================================================ */


function createFaceMaterial(
    face,
    assetTexture
) {

    const faceTexture =
        Array.isArray(assetTexture)
            ? assetTexture[
                Number(
                    String(face?.texture || "#0")
                        .replace("#", "")
                )
            ] || assetTexture[0]
            : assetTexture;

    /*
     * If there is no texture, use a neutral
     * material.
     */

    if (
        !face ||
        !faceTexture
    ) {

        return new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,
            roughness: 0.8
        });
    }


    const material =
        new THREE.MeshStandardMaterial({
            map: faceTexture,
            color: 0xffffff,

            alphaTest: 0.5,
            transparent: true,
            depthWrite: true,

            roughness: 0.8,

            side: THREE.DoubleSide
        });


    return material;
}


/* ============================================================
 *
 * UV MAPPING
 *
 * ============================================================ */


function applyFaceUVs(
    geometry,
    element,
    assetData,
    uvScale,
    flipVerticalSideUVs,
    flipAllUVs
) {

    const uvAttribute =
        geometry.attributes.uv;


    const textureSize =
        assetData.texture_size ||
        [16, 16];


    const textureWidth =
        textureSize[0] /
        uvScale;


    const textureHeight =
        textureSize[1] /
        uvScale;


    /*
     * BoxGeometry's groups correspond to:
     *
     * 0 = +X
     * 1 = -X
     * 2 = +Y
     * 3 = -Y
     * 4 = +Z
     * 5 = -Z
     *
     */

    const faces = [
        "east",
        "west",
        "up",
        "down",
        "south",
        "north"
    ];


    for (
        let faceIndex = 0;
        faceIndex < 6;
        faceIndex++
    ) {

        const faceName =
            faces[faceIndex];


        const face =
            element.faces?.[faceName];


        if (
            !face ||
            !face.uv
        ) {
            continue;
        }


        let [
            u1,
            v1,
            u2,
            v2
        ] = face.uv;


        /*
         * Blockbench UVs are pixel coordinates.
         */

        u1 /= textureWidth;
        u2 /= textureWidth;

        v1 =
            1 -
            v1 / textureHeight;

        v2 =
            1 -
            v2 / textureHeight;


        /*
         * BoxGeometry has four vertices per face.

         *
         * Find the appropriate four vertices.
         */

        const start =
            faceIndex * 4;


        /*
         * Blockbench can intentionally provide:
         *
         *     [10, 10, 0, 0]
         *
         * instead of:
         *
         *     [0, 0, 10, 10]
         *
         */

            const standardFaceUVs =
                [u1, v2, u2, v2, u1, v1, u2, v1];


            const verticallyFlippedFaceUVs =
                [u1, v1, u2, v1, u1, v2, u2, v2];


            const faceUVs =
                (flipAllUVs ||
                    (flipVerticalSideUVs &&
                faceName !== "up" &&
                faceName !== "down"))
                    ? verticallyFlippedFaceUVs
                    : standardFaceUVs;


        for (
            let vertexIndex = 0;
            vertexIndex < 4;
            vertexIndex++
        ) {

            uvAttribute.setXY(
                start + vertexIndex,
                faceUVs[vertexIndex * 2],
                faceUVs[vertexIndex * 2 + 1]
            );
        }
    }


    uvAttribute.needsUpdate =
        true;
}


function setEyeGaze(
    lookRight
) {

    modelRoot.traverse(
        object => {

            if (
                !object.userData?.isEye
            ) {
                return;
            }


            const uvAttribute =
                object.geometry.attributes.uv;

            const defaultUVs =
                object.userData.defaultUVs;


            for (
                let faceIndex = 0;
                faceIndex < 6;
                faceIndex++
            ) {

                const firstUVIndex =
                    faceIndex * 8;

                const uValues = [
                    defaultUVs[firstUVIndex],
                    defaultUVs[firstUVIndex + 2],
                    defaultUVs[firstUVIndex + 4],
                    defaultUVs[firstUVIndex + 6]
                ];

                const minimumU =
                    Math.min(...uValues);

                const maximumU =
                    Math.max(...uValues);

                const vValues = [
                    defaultUVs[firstUVIndex + 1],
                    defaultUVs[firstUVIndex + 3],
                    defaultUVs[firstUVIndex + 5],
                    defaultUVs[firstUVIndex + 7]
                ];

                const minimumV =
                    Math.min(...vValues);

                const maximumV =
                    Math.max(...vValues);


                for (
                    let vertexIndex = 0;
                    vertexIndex < 4;
                    vertexIndex++
                ) {

                    const uvIndex =
                        firstUVIndex + vertexIndex * 2;

                    const defaultU =
                        defaultUVs[uvIndex];

                    uvAttribute.array[uvIndex] =
                        lookRight
                            ? minimumU + maximumU - defaultU
                            : defaultU;

                    uvAttribute.array[uvIndex + 1] =
                        minimumV +
                        maximumV -
                        defaultUVs[uvIndex + 1];
                }
            }


            uvAttribute.needsUpdate =
                true;
        }
    );
}


/* ============================================================
 *
 * CUBE ROTATION
 *
 * ============================================================ */


function applyCubeRotation(
    mesh,
    rotation
) {

    /*
     * Your JSON uses two slightly different
     * representations:
     *
     *     { x, y, z, origin }
     *
     * and:
     *
     *     { angle, axis, origin }
     *
     * Both are supported.
     */


    const origin =
        rotation.origin ||
        [0, 0, 0];


    const pivot =
        new THREE.Group();


    /*
     * The pivot itself is initially positioned
     * at the rotation origin.
     *
     * The parent/group transformation will be
     * corrected later by buildGroup().
     */

    pivot.userData.blockbenchOrigin =
        new THREE.Vector3(
            origin[0],
            origin[1],
            origin[2]
        );


    /*
     * Mesh currently has a WORLD position.
     *
     * Move it relative to the rotation pivot.
     */

    mesh.position.sub(
        pivot.userData.blockbenchOrigin
    );


    pivot.add(
        mesh
    );


    /*
     * axis + angle format
     */

    if (
        rotation.axis !== undefined
    ) {

        const angle =
            THREE.MathUtils.degToRad(
                rotation.angle || 0
            );


        if (
            rotation.axis === "x"
        ) {

            pivot.rotation.x =
                angle;

        } else if (
            rotation.axis === "y"
        ) {

            pivot.rotation.y =
                angle;

        } else if (
            rotation.axis === "z"
        ) {

            pivot.rotation.z =
                angle;
        }
    }


    /*
     * x/y/z format
     */

    else {

        pivot.rotation.x =
            THREE.MathUtils.degToRad(
                rotation.x || 0
            );


        pivot.rotation.y =
            THREE.MathUtils.degToRad(
                rotation.y || 0
            );


        pivot.rotation.z =
            THREE.MathUtils.degToRad(
                rotation.z || 0
            );
    }


    /*
     * Store the original origin.

     */

    pivot.userData.isRotationPivot =
        true;


    pivot.userData.tPoseRotation =
        pivot.rotation.clone();


    /*
     * Replace mesh with the pivot.

     */

    mesh.userData.rotationPivot =
        pivot;


    return pivot;
}


/* ============================================================
 *
 * BUILD GROUP
 *
 * ============================================================ */


function buildGroup(
    groupData,
    parent,
    meshes,
    elements
) {

    const group =
        new THREE.Group();


    group.name =
        groupData.name ||
        "group";

    const jointMatch =
        group.name.match(
            /^([XYZ]+)-(.+)$/i
        );


    if (
        jointMatch
    ) {

        group.userData.allowedAxes =
            jointMatch[1].toLowerCase();


        group.userData.tPoseRotation =
            group.rotation.clone();


        armJoints[group.name] =
            group;
    }


    const origin =
        getGroupOrigin(
            groupData,
            elements
        );


    group.userData.blockbenchOrigin =
        new THREE.Vector3(
            origin[0],
            origin[1],
            origin[2]
        );


    /*
     * IMPORTANT:
     *
     * Blockbench group origins are in MODEL/WORLD
     * coordinates.
     *
     * Therefore the group must be positioned
     * relative to its parent's origin.
     */

    const parentOrigin =
        parent.userData.blockbenchOrigin ||
        new THREE.Vector3(
            0,
            0,
            0
        );


    group.position.set(
        origin[0] - parentOrigin.x,
        origin[1] - parentOrigin.y,
        origin[2] - parentOrigin.z
    );


    parent.add(
        group
    );


    /*
     * Process children.

     */

    if (
        !Array.isArray(
            groupData.children
        )
    ) {

        return group;
    }


    for (
        const child of groupData.children
    ) {

        /*
         * Numeric children reference an
         * element index.
         */

        if (
            typeof child === "number"
        ) {

            const mesh =
                meshes[child];


            if (!mesh) {
                continue;
            }


            /*
             * If the cube has a rotation pivot,
             * use that instead of the cube directly.
             */

            const object =
                mesh.userData.rotationPivot ||
                mesh;


            /*
             * Mesh coordinates were originally
             * calculated in model/world space.
             *
             * Convert them to the current group's
             * coordinate space.
             */

            if (
                object.userData
                    ?.isRotationPivot
            ) {

                const rotationOrigin =
                    object.userData
                        .blockbenchOrigin;


                object.position.set(
                    rotationOrigin.x - origin[0],
                    rotationOrigin.y - origin[1],
                    rotationOrigin.z - origin[2]
                );


                /*
                 * The mesh inside the pivot is already
                 * relative to the rotation origin.
                 */

            } else {

                mesh.position.sub(
                    group.userData
                        .blockbenchOrigin
                );
            }


            group.add(
                object
            );


            if (
                mesh.name.toLowerCase() === "thumb" &&
                object.userData?.isRotationPivot
            ) {
                const side =
                    group.name.endsWith("R")
                        ? "R"
                        : "L";

                thumbJoints[side] =
                    object;
            }


            continue;
        }


        /*
         * Object children are nested groups.
         */

        if (
            typeof child === "object"
        ) {

            buildGroup(
                child,
                group,
                meshes,
                elements
            );
        }
    }


    return group;
}


function getGroupOrigin(
    groupData,
    elements
) {

    if (
        groupData.name === "Y-head"
    ) {
        return groupData.origin || [0, 0, 0];
    }


    if (
        Array.isArray(
            groupData.children
        )
    ) {

        for (
            const child of groupData.children
        ) {

            if (
                typeof child !== "number"
            ) {
                continue;
            }


            const rotationOrigin =
                elements[child]
                    ?.rotation
                    ?.origin;


            if (
                Array.isArray(
                    rotationOrigin
                )
            ) {
                return rotationOrigin;
            }
        }
    }


    return groupData.origin || [0, 0, 0];
}


function rotateArmJoint(
    jointName,
    axis,
    angle
) {

    const joint =
        armJoints[jointName];


    if (!joint) {
        return;
    }


    if (
        !joint.userData.allowedAxes?.includes(
            axis.toLowerCase()
        )
    ) {
        return;
    }


    joint.rotation[axis] =
        clampJointRotation(angle);

    /*
     * Keep the other axes inside their limits as well. This makes
     * rotateArmJoint() a hard safety boundary for every joint,
     * regardless of how the joint was previously rotated.
     */
    clampJoint(joint);
}


function splitScriptArguments(
    argumentText
) {

    const argumentsList = [];
    let current = "";
    let quote = null;
    let depth = 0;


    for (
        const character of argumentText
    ) {

        if (
            quote
        ) {

            current += character;

            if (
                character === quote
            ) {
                quote = null;
            }

            continue;
        }


        if (
            character === "\"" ||
            character === "'"
        ) {
            quote = character;
            current += character;
        } else if (
            character === "[" ||
            character === "("
        ) {
            depth++;
            current += character;
        } else if (
            character === "]" ||
            character === ")"
        ) {
            depth--;
            current += character;
        } else if (
            character === "," &&
            depth === 0
        ) {
            argumentsList.push(current.trim());
            current = "";
        } else {
            current += character;
        }
    }


    if (
        current.trim()
    ) {
        argumentsList.push(current.trim());
    }


    return argumentsList;
}


function parseScriptValue(value) {
    const trimmedValue =
        value.trim();

    /*
     * String literal
     */
    if (
        (trimmedValue.startsWith('"') &&
            trimmedValue.endsWith('"')) ||

        (trimmedValue.startsWith("'") &&
            trimmedValue.endsWith("'"))
    ) {
        return trimmedValue.slice(1, -1);
    }

    /*
     * Array
     */
    if (
        trimmedValue.startsWith("[") &&
        trimmedValue.endsWith("]")
    ) {
        return splitScriptArguments(
            trimmedValue.slice(1, -1)
        ).map(
            parseScriptValue
        );
    }

    /*
     * Boolean
     */
    if (trimmedValue === "true") {
        return true;
    }

    if (trimmedValue === "false") {
        return false;
    }

    /*
     * Number
     */
    const numberValue =
        Number(trimmedValue);

    if (!Number.isNaN(numberValue)) {
        return numberValue;
    }

    /*
     * Variable
     *
     * Only treat valid identifiers as variable names.
     * This prevents arbitrary text from being passed
     * to callVariable().
     */
    if (
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(
            trimmedValue
        )
    ) {
        return callVariable(
            trimmedValue
        );
    }

    /*
     * Unknown value
     */
    return undefined;
}


function getScriptArguments(
    argumentText
) {

    const values = {};
    const positional = [];


    for (
        const argument of splitScriptArguments(argumentText)
    ) {

        const equalsIndex =
            argument.indexOf("=");


        if (
            equalsIndex > 0
        ) {
            values[
                argument.slice(0, equalsIndex).trim()
            ] = parseScriptValue(
                argument.slice(equalsIndex + 1)
            );
        } else {
            positional.push(
                parseScriptValue(argument)
            );
        }
    }


    return {
        values,
        positional
    };
}


function getScriptJointName(
    partName,
    axis
) {

    const normalizedAxis =
        String(axis || "")
            .trim()
            .toUpperCase();


    const normalizedPartName =
        String(partName || "")
            .trim()
            .replace(
                /^[XYZ]+-/i,
                ""
            );


    const axisSpecificJointName =
        `${normalizedAxis}-${normalizedPartName}`;


    if (
        armJoints[axisSpecificJointName]
    ) {
        return axisSpecificJointName;
    }


    const multiAxisJointName =
        `XYZ-${normalizedPartName}`;


    if (
        armJoints[multiAxisJointName]
    ) {
        return multiAxisJointName;
    }


    const matchingJointName =
        Object.keys(
            armJoints
        ).find(
            jointName =>
                jointName.endsWith(
                    `-${normalizedPartName}`
                ) &&
                armJoints[jointName].userData.allowedAxes?.includes(
                    normalizedAxis.toLowerCase()
                )
        );


    if (
        matchingJointName
    ) {
        return matchingJointName;
    }


    return axisSpecificJointName;
}

function defineVariable(varName, varType, value = undefined) {
    varName = String(varName).trim();
    varType = String(varType).trim().toLowerCase();

    if (!varName) {
        throw new Error("define(): variable name cannot be empty.");
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
        throw new Error(
            `define(): invalid variable name "${varName}".`
        );
    }

    if (!["text", "num", "logic"].includes(varType)) {
        throw new Error(
            `define(): invalid variable type "${varType}". ` +
            `Expected "text", "num", or "logic".`
        );
    }

    // Default values
    if (value === undefined) {
        if (varType === "text") value = "-";
        if (varType === "num") value = 0;
        if (varType === "logic") value = false;
    }

    // Convert / validate the initial value
    if (varType === "text") {
        value = String(value);
    }

    else if (varType === "num") {
        value = Number(value);

        if (!Number.isFinite(value)) {
            throw new Error(
                `define(): "${varName}" requires a numeric value.`
            );
        }
    }

    else if (varType === "logic") {
        if (typeof value === "string") {
            const lower = value.toLowerCase();

            if (lower === "true") {
                value = true;
            }
            else if (lower === "false") {
                value = false;
            }
            else {
                throw new Error(
                    `define(): "${varName}" requires true or false.`
                );
            }
        }

        if (typeof value !== "boolean") {
            throw new Error(
                `define(): "${varName}" requires a logical value.`
            );
        }
    }

    const key = `${varName};${varType}`;

    scriptVariables[key] = value;

    return value;
}


function callVariable(varName) {
    varName = String(varName).trim();

    for (const key of Object.keys(scriptVariables)) {
        const [storedName] = key.split(";");

        if (storedName === varName) {
            return scriptVariables[key];
        }
    }

    throw new Error(
        `call(): variable "${varName}" does not exist.`
    );
}

function evaluateScriptExpression(expression) {
    expression = String(expression).trim();

    if (!expression) {
        throw new Error("change(): expression cannot be empty.");
    }

    /*
     * ---------------------------------------------------------
     * Quoted string
     * ---------------------------------------------------------
     */

    if (
        (expression.startsWith('"') && expression.endsWith('"')) ||
        (expression.startsWith("'") && expression.endsWith("'"))
    ) {
        return expression.slice(1, -1);
    }

    /*
     * ---------------------------------------------------------
     * Boolean literals
     * ---------------------------------------------------------
     */

    if (expression === "true") {
        return true;
    }

    if (expression === "false") {
        return false;
    }

    /*
     * ---------------------------------------------------------
     * Numeric literal
     * ---------------------------------------------------------
     */

    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(expression)) {
        return Number(expression);
    }

    /*
     * ---------------------------------------------------------
     * Single variable
     * ---------------------------------------------------------
     */

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expression)) {
        return callVariable(expression);
    }

    /*
     * ---------------------------------------------------------
     * Arithmetic expression
     *
     * Only + - * / and parentheses are allowed.
     * ---------------------------------------------------------
     */

    const tokens = tokenizeVariableExpression(expression);

    let position = 0;

    function peek() {
        return tokens[position];
    }

    function consume() {
        return tokens[position++];
    }

    function parseExpression() {
        let value = parseTerm();

        while (peek() === "+" || peek() === "-") {
            const operator = consume();
            const right = parseTerm();

            if (
                typeof value !== "number" ||
                typeof right !== "number"
            ) {
                throw new Error(
                    `Cannot use "${operator}" on non-numeric values.`
                );
            }

            if (operator === "+") {
                value += right;
            }
            else {
                value -= right;
            }
        }

        return value;
    }

    function parseTerm() {
        let value = parseFactor();

        while (peek() === "*" || peek() === "/") {
            const operator = consume();
            const right = parseFactor();

            if (
                typeof value !== "number" ||
                typeof right !== "number"
            ) {
                throw new Error(
                    `Cannot use "${operator}" on non-numeric values.`
                );
            }

            if (operator === "*") {
                value *= right;
            }
            else {
                if (right === 0) {
                    throw new Error("Division by zero.");
                }

                value /= right;
            }
        }

        return value;
    }

    function parseFactor() {
        const token = consume();

        if (token === "(") {
            const value = parseExpression();

            if (consume() !== ")") {
                throw new Error("Missing closing parenthesis.");
            }

            return value;
        }

        if (token === "-") {
            const value = parseFactor();

            if (typeof value !== "number") {
                throw new Error(
                    "Unary minus can only be used with numbers."
                );
            }

            return -value;
        }

        if (token === "+") {
            return parseFactor();
        }

        if (typeof token !== "string") {
            throw new Error("Invalid expression.");
        }

        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
            return Number(token);
        }

        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
            return callVariable(token);
        }

        throw new Error(
            `Unknown expression token "${token}".`
        );
    }

    const result = parseExpression();

    if (position < tokens.length) {
        throw new Error(
            `Unexpected token "${tokens[position]}".`
        );
    }

    return result;
}

function tokenizeVariableExpression(expression) {
    const tokens = [];
    let i = 0;

    while (i < expression.length) {
        const char = expression[i];

        if (/\s/.test(char)) {
            i++;
            continue;
        }

        if ("()+-*/".includes(char)) {
            tokens.push(char);
            i++;
            continue;
        }

        if (char === '"' || char === "'") {
            const quote = char;
            let value = "";
            i++;

            while (i < expression.length && expression[i] !== quote) {
                value += expression[i];
                i++;
            }

            if (i >= expression.length) {
                throw new Error("Unclosed string.");
            }

            i++;

            tokens.push(value);
            continue;
        }

        const numberMatch = expression
            .slice(i)
            .match(/^(?:\d+(?:\.\d*)?|\.\d+)/);

        if (numberMatch) {
            tokens.push(numberMatch[0]);
            i += numberMatch[0].length;
            continue;
        }

        const identifierMatch = expression
            .slice(i)
            .match(/^[A-Za-z_][A-Za-z0-9_]*/);

        if (identifierMatch) {
            tokens.push(identifierMatch[0]);
            i += identifierMatch[0].length;
            continue;
        }

        throw new Error(
            `Invalid character "${char}" in expression.`
        );
    }

    return tokens;
}

function tokenizeLogicalExpression(expression) {
    const tokens = [];

    let i = 0;

    while (i < expression.length) {
        const character = expression[i];

        if (/\s/.test(character)) {
            i++;
            continue;
        }

        /*
         * Parentheses
         */
        if (
            character === "(" ||
            character === ")"
        ) {
            tokens.push(character);
            i++;
            continue;
        }

        /*
         * Comparison operators
         *
         * Check the two-character operators first.
         */
        const twoCharacterOperator =
            expression.slice(i, i + 2);

        if (
            twoCharacterOperator === "<=" ||
            twoCharacterOperator === ">=" ||
            twoCharacterOperator === "==" ||
            twoCharacterOperator === "!="
        ) {
            tokens.push({
                type: "operator",
                value: twoCharacterOperator
            });

            i += 2;
            continue;
        }

        /*
         * Single-character comparison operators
         */
        if (
            character === "<" ||
            character === ">"
        ) {
            tokens.push({
                type: "operator",
                value: character
            });

            i++;
            continue;
        }

        /*
         * String literal
         */
        if (
            character === '"' ||
            character === "'"
        ) {
            const quote = character;
            let value = "";
            let escaped = false;

            i++;

            while (i < expression.length) {
                const current =
                    expression[i];

                if (escaped) {
                    value += current;
                    escaped = false;
                    i++;
                    continue;
                }

                if (current === "\\") {
                    escaped = true;
                    i++;
                    continue;
                }

                if (current === quote) {
                    break;
                }

                value += current;
                i++;
            }

            if (
                i >= expression.length ||
                expression[i] !== quote
            ) {
                throw new Error(
                    "Unterminated string in logical expression."
                );
            }

            tokens.push({
                type: "value",
                value
            });

            i++;
            continue;
        }

        /*
         * Number
         */
        const numberMatch =
            expression
                .slice(i)
                .match(
                    /^(?:\d+(?:\.\d*)?|\.\d+)/
                );

        if (numberMatch) {
            tokens.push({
                type: "value",
                value: Number(numberMatch[0])
            });

            i += numberMatch[0].length;
            continue;
        }

        /*
         * Identifier / keyword
         */
        const identifierMatch =
            expression
                .slice(i)
                .match(
                    /^[A-Za-z_][A-Za-z0-9_]*/
                );

        if (identifierMatch) {
            const word =
                identifierMatch[0];

            const upper =
                word.toUpperCase();

            if (
                upper === "NOT" ||
                upper === "AND" ||
                upper === "OR"
            ) {
                tokens.push(upper);
            }
            else if (upper === "TRUE") {
                tokens.push({
                    type: "value",
                    value: true
                });
            }
            else if (upper === "FALSE") {
                tokens.push({
                    type: "value",
                    value: false
                });
            }
            else {
                tokens.push({
                    type: "variable",
                    value: word
                });
            }

            i += word.length;
            continue;
        }

        throw new Error(
            `Invalid character "${character}" in logical expression.`
        );
    }

    return tokens;
}

function evaluateLogicalExpression(expression) {
    expression =
        String(expression).trim();

    if (!expression) {
        return true;
    }

    const tokens =
        tokenizeLogicalExpression(
            expression
        );

    let position = 0;

    function peek() {
        return tokens[position];
    }

    function consume(expected = undefined) {
        const token = tokens[position];

        if (
            expected !== undefined &&
            token !== expected
        ) {
            throw new Error(
                `Expected "${expected}" in logical expression.`
            );
        }

        position++;

        return token;
    }

    /*
     * Resolve a value token.
     *
     * Unlike the old implementation, variables are NOT
     * immediately converted to Boolean. We need their
     * actual values for comparisons such as:
     *
     * index < 5
     */
    function parseValue() {
        const token = peek();

        if (
            token &&
            typeof token === "object"
        ) {
            consume();

            if (token.type === "value") {
                return token.value;
            }

            if (token.type === "variable") {
                return callVariable(
                    token.value
                );
            }
        }

        throw new Error(
            "Expected a value in logical expression."
        );
    }

    /*
     * Primary expression
     *
     * Handles:
     *
     *     5
     *     index
     *     true
     *     (index < 5)
     */
    function parsePrimary() {
        if (peek() === "(") {
            consume("(");

            const value =
                parseOr();

            if (peek() !== ")") {
                throw new Error(
                    "Missing closing ')' in logical expression."
                );
            }

            consume(")");

            return value;
        }

        return parseValue();
    }

    /*
     * Comparison
     *
     * Handles:
     *
     *     <
     *     <=
     *     >
     *     >=
     *     ==
     *     !=
     */
    function parseComparison() {
        const left =
            parsePrimary();

        const operator =
            peek();

        if (
            !operator ||
            typeof operator !== "object" ||
            operator.type !== "operator"
        ) {
            return Boolean(left);
        }

        consume();

        const right =
            parsePrimary();

        switch (operator.value) {
            case "<":
                return left < right;

            case "<=":
                return left <= right;

            case ">":
                return left > right;

            case ">=":
                return left >= right;

            case "==":
                return left === right;

            case "!=":
                return left !== right;

            default:
                throw new Error(
                    `Unknown comparison operator "${operator.value}".`
                );
        }
    }

    /*
     * NOT
     */
    function parseNot() {
        if (peek() === "NOT") {
            consume("NOT");

            return !parseNot();
        }

        return parseComparison();
    }

    /*
     * AND
     */
    function parseAnd() {
        let value =
            parseNot();

        while (peek() === "AND") {
            consume("AND");

            const right =
                parseNot();

            value =
                value && right;
        }

        return value;
    }

    /*
     * OR
     */
    function parseOr() {
        let value =
            parseAnd();

        while (peek() === "OR") {
            consume("OR");

            const right =
                parseAnd();

            value =
                value || right;
        }

        return value;
    }

    const result =
        parseOr();

    if (position < tokens.length) {
        throw new Error(
            "Unexpected token in logical expression."
        );
    }

    return Boolean(result);
}

function extractScriptDefinitions(source) {
    const definitions = {};
    const lines = source.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        /*
         * Supports both:
         *
         *     def test:
         *
         * and:
         *
         *     def test():
         */
        const match = line.match(
            /^(\s*)def\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?\s*:/
        );

        if (!match) {
            continue;
        }

        const indentation = match[1]
            .replace(/\t/g, "    ")
            .length;

        const scriptName = match[2];
        const body = [];

        i++;

        while (i < lines.length) {
            const bodyLine = lines[i];

            /*
             * Completely blank lines belong to the body.
             */
            if (bodyLine.trim() === "") {
                body.push("");
                i++;
                continue;
            }

            const indentationMatch =
                bodyLine.match(/^\s*/);

            const bodyIndentation =
                indentationMatch
                    ? indentationMatch[0]
                        .replace(/\t/g, "    ")
                        .length
                    : 0;

            /*
             * A line with equal or less indentation
             * means that the definition has ended.
             */
            if (bodyIndentation <= indentation) {
                i--;
                break;
            }

            body.push(bodyLine);
            i++;
        }

        definitions[scriptName] =
            body.join("\n");
    }

    return definitions;
}

function extractScriptCalls(source) {
    const calls = [];

    const functionPattern =
         /\b(define|log|call|change|rotatePart|cyclicMovement|reset|openHand|closeHand|wait|speak|subroutine)\s*\(/g;

    let match;

    while ((match = functionPattern.exec(source)) !== null) {
        const functionName = match[1];
        const openParenthesis =
            functionPattern.lastIndex - 1;

        let depth = 1;
        let i = openParenthesis + 1;

        let quote = null;
        let escaped = false;

        for (; i < source.length; i++) {
            const character = source[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (character === "\\") {
                escaped = true;
                continue;
            }

            if (quote !== null) {
                if (character === quote) {
                    quote = null;
                }

                continue;
            }

            if (
                character === '"' ||
                character === "'"
            ) {
                quote = character;
                continue;
            }

            if (character === "(") {
                depth++;
            }
            else if (character === ")") {
                depth--;

                if (depth === 0) {
                    break;
                }
            }
        }

        if (depth !== 0) {
            throw new Error(
                `${functionName}(): missing closing parenthesis.`
            );
        }

        calls.push({
            functionName,
            argumentText:
                source.slice(
                    openParenthesis + 1,
                    i
                ),
            index: match.index,
            length:
                i - match.index + 1
        });

        /*
         * Don't allow the regular-expression scanner
         * to find functions inside this call as separate
         * top-level operations.
         */
        functionPattern.lastIndex = i + 1;
    }

    return calls;
}

function changeVariable(varName, newValue) {
    varName = String(varName).trim();

    let variableKey = null;
    let variableType = null;

    for (const key of Object.keys(scriptVariables)) {
        const separator = key.indexOf(";");

        const storedName = key.slice(0, separator);
        const storedType = key.slice(separator + 1);

        if (storedName === varName) {
            variableKey = key;
            variableType = storedType;
            break;
        }
    }

    if (!variableKey) {
        throw new Error(
            `change(): variable "${varName}" does not exist.`
        );
    }

    const evaluatedValue =
        evaluateScriptExpression(newValue);

    /*
     * Type checking
     */

    if (variableType === "text") {
        if (typeof evaluatedValue !== "string") {
            throw new Error(
                `change(): "${varName}" is a text variable, ` +
                `but the new value is ${typeof evaluatedValue}.`
            );
        }
    }

    else if (variableType === "num") {
        if (
            typeof evaluatedValue !== "number" ||
            !Number.isFinite(evaluatedValue)
        ) {
            throw new Error(
                `change(): "${varName}" is a number variable, ` +
                `but the evaluated value is not a number.`
            );
        }
    }

    else if (variableType === "logic") {
        if (typeof evaluatedValue !== "boolean") {
            throw new Error(
                `change(): "${varName}" is a logic variable, ` +
                `but the evaluated value is not true or false.`
            );
        }
    }

    scriptVariables[variableKey] = evaluatedValue;

    return evaluatedValue;
}

function parseSubroutineArguments(argumentText) {
    const argumentsList =
        splitScriptArguments(
            argumentText
        );

    let script = undefined;
    let repeat = false;
    let condition = "true";

    for (const rawArgument of argumentsList) {
        const argument =
            rawArgument.trim();

        if (!argument) {
            continue;
        }

        const equalsIndex =
            findTopLevelEquals(argument);

        if (equalsIndex === -1) {
            if (script !== undefined) {
                throw new Error(
                    "subroutine(): only one positional script argument is allowed."
                );
            }

            script =
                parseScriptValue(argument);

            continue;
        }

        const key =
            argument
                .slice(0, equalsIndex)
                .trim()
                .toLowerCase();

        const value =
            argument
                .slice(equalsIndex + 1)
                .trim();

        if (key === "repeat") {
            const parsed =
                parseScriptValue(value);

            if (typeof parsed !== "boolean") {
                throw new Error(
                    "subroutine(): repeat must be true or false."
                );
            }

            repeat = parsed;
        }
        else if (key === "condition") {
            condition = value;

            /*
             * Remove surrounding quotes if the
             * entire condition was supplied as a string.
             */
            if (
                (
                    condition.startsWith('"') &&
                    condition.endsWith('"')
                ) ||
                (
                    condition.startsWith("'") &&
                    condition.endsWith("'")
                )
            ) {
                condition =
                    condition.slice(
                        1,
                        -1
                    );
            }
        }
        else {
            throw new Error(
                `subroutine(): unknown argument "${key}".`
            );
        }
    }

    if (script === undefined) {
        throw new Error(
            "subroutine() requires a script name."
        );
    }

    return {
        script,
        repeat,
        condition
    };
}

function findTopLevelEquals(text) {
    let parenthesisDepth = 0;

    let bracketDepth = 0;

    let quote = null;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const character = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (quote !== null) {
            if (character === quote) {
                quote = null;
            }

            continue;
        }

        if (
            character === '"' ||
            character === "'"
        ) {
            quote = character;
            continue;
        }

        if (character === "(") {
            parenthesisDepth++;
        }
        else if (character === ")") {
            parenthesisDepth--;
        }
        else if (character === "[") {
            bracketDepth++;
        }
        else if (character === "]") {
            bracketDepth--;
        }
        else if (
            character === "=" &&
            parenthesisDepth === 0 &&
            bracketDepth === 0
        ) {
            return i;
        }
    }

    return -1;
}

function getStoredScript(scriptName) {
    scriptName = String(scriptName).trim();

    /*
     * First check explicitly stored scripts.
     */
    if (
        Object.prototype.hasOwnProperty.call(
            storedScripts,
            scriptName
        )
    ) {
        return storedScripts[scriptName];
    }

    /*
     * Then check scripts loaded through
     * SCRIPT LOAD or the default test.py.
     */
    if (
        loadedPythonFiles.has(scriptName)
    ) {
        return loadedPythonFiles.get(scriptName).source;
    }

    /*
     * Allow omitting .py:
     *
     * subroutine("test")
     *
     * becomes:
     *
     * test.py
     */
    if (!scriptName.endsWith(".py")) {
        const withExtension =
            `${scriptName}.py`;

        if (
            Object.prototype.hasOwnProperty.call(
                storedScripts,
                withExtension
            )
        ) {
            return storedScripts[withExtension];
        }

        if (
            loadedPythonFiles.has(withExtension)
        ) {
            return loadedPythonFiles.get(withExtension).source;
        }
    }

    return undefined;
}

async function runSubroutine(
    scriptName,
    repeat = false,
    condition = "true",
    executionId = pythonExecutionId,
    definitions = {}
) {
    scriptName =
        String(scriptName).trim();

    /*
     * First look for a stored script.
     */
    let scriptSource =
        getStoredScript(scriptName);

    /*
     * If there is no stored script, fall back
     * to a def block from the current source.
     */
    if (scriptSource === undefined) {
        if (
            Object.prototype.hasOwnProperty.call(
                definitions,
                scriptName
            )
        ) {
            scriptSource =
                definitions[scriptName];
        }
        else {
            throw new Error(
                `subroutine(): script "${scriptName}" does not exist.`
            );
        }
    }

    do {

        /*
         * FRESET cancelled the entire
         * execution tree.
         */
        if (
            executionId !==
            pythonExecutionId
        ) {
            return false;
        }

        /*
         * Check the condition before every
         * invocation.
         */
        const shouldRun =
            evaluateLogicalExpression(
                condition
            );

        if (!shouldRun) {
            return true;
        }

        /*
         * Execute the stored script.
         *
         * The same executionId is passed down,
         * so FRESET also cancels nested scripts.
         */
        await runPythonSource(
            scriptSource,
            executionId,
            definitions
        );

        /*
         * A nested script may have been
         * cancelled while it was running.
         */
        if (
            executionId !==
            pythonExecutionId
        ) {
            return false;
        }

        if (!repeat) {
            break;
        }

    } while (
        executionId === pythonExecutionId
    );

    return true;
}

function scheduleRotatePart(
    partName,
    axis,
    degree,
    duration
) {

    const numericDegree =
        Number(degree);
    const numericDuration =
        Number(duration ?? 1);


    if (
        !Number.isFinite(numericDegree) ||
        !Number.isFinite(numericDuration)
    ) {
        throw new Error(
            "rotatePart degree and time must be numbers."
        );
    }

    const jointName =
        getScriptJointName(
            partName,
            axis
        );

    const joint =
        armJoints[jointName];


    if (
        !joint ||
        !joint.userData.allowedAxes?.includes(
            String(axis).toLowerCase()
        )
    ) {
        throw new Error(
            `Cannot rotate ${partName} on ${axis}.`
        );
    }


    const normalizedDuration =
        Math.max(
            0.01,
            numericDuration
        );


    scriptedRotations.push({
        joint,
        axis: String(axis).toLowerCase(),
        start: joint.rotation[
            String(axis).toLowerCase()
        ],
        target: clampJointRotation(
            THREE.MathUtils.degToRad(
                numericDegree
            )
        ),
        startTime: waveClock.getElapsedTime(),
        duration: normalizedDuration
    });
}


function scheduleCyclicMovement(
    jointName,
    axis,
    amplitude,
    speed,
    phase,
    offset = 0
) {

    const numericValues = [
        amplitude,
        speed,
        phase,
        offset
    ].map(
        Number
    );


    if (
        numericValues.some(
            value => !Number.isFinite(value)
        )
    ) {
        throw new Error(
            "cyclicMovement amplitude, speed, phase, and offset must be numbers."
        );
    }

    const joint =
        armJoints[jointName] ||
        armJoints[
            getScriptJointName(
                jointName,
                axis
            )
        ];


    if (
        !joint ||
        !joint.userData.allowedAxes?.includes(
            String(axis).toLowerCase()
        )
    ) {
        throw new Error(
            `Cannot animate ${jointName} on ${axis}.`
        );
    }


    scriptedCycles.push({
        jointName: joint.name,
        axis: String(axis).toLowerCase(),
        amplitude: numericValues[0],
        speed: numericValues[1],
        phase: numericValues[2],
        offset: numericValues[3]
    });
}


function releaseGrabbedObject(
    side
) {

    for (
        const object of grabbableObjects
    ) {

        if (
            object.userData.grabbedBy !== side
        ) {
            continue;
        }


        scene.attach(
            object
        );
        delete object.userData.grabbedBy;
    }


    handIsHolding[side] = false;
}


function setHandState(
    open,
    side
) {

    resetAnimation = null;


    const selectedSides = [];
    const normalizedSide =
        String(side || "")
            .toUpperCase();


    if (
        normalizedSide.includes("L")
    ) {
        selectedSides.push("L");
    }


    if (
        normalizedSide.includes("R")
    ) {
        selectedSides.push("R");
    }


    if (
        selectedSides.length === 0
    ) {
        throw new Error(
            "A hand side containing L or R is required."
        );
    }


    for (const selectedSide of selectedSides) {

        const thumb =
            thumbJoints[selectedSide];


        if (
            !thumb
        ) {
            continue;
        }


        const tPoseRotation =
            thumb.userData.tPoseRotation ||
            new THREE.Euler();


        thumb.rotation.copy(
            tPoseRotation
        );


        if (
            open
        ) {
            releaseGrabbedObject(
                selectedSide
            );

            thumb.rotation.z +=
                THREE.MathUtils.degToRad(
                    selectedSide === "R"
                        ? -60
                        : 60
                );

            handCanGrab[selectedSide] = true;
        } else {
            tryGrabObject(
                selectedSide
            );

            handCanGrab[selectedSide] = false;
        }
    }
}


function openHand(
    side
) {
    setHandState(
        true,
        side
    );
}


function closeHand(
    side
) {
    setHandState(
        false,
        side
    );
}


function decodeBase64Pcm(
    base64Audio,
    sampleRate
) {

    const binaryAudio =
        atob(base64Audio);

    const audioBytes =
        new Uint8Array(
            binaryAudio.length
        );


    for (
        let index = 0;
        index < binaryAudio.length;
        index++
    ) {
        audioBytes[index] =
            binaryAudio.charCodeAt(index);
    }


    const frameCount =
        Math.floor(audioBytes.length / 2);

    const audioBuffer =
        speechAudioContext.createBuffer(
            1,
            frameCount,
            sampleRate
        );

    const channelData =
        audioBuffer.getChannelData(0);

    const audioView =
        new DataView(
            audioBytes.buffer
        );


    for (
        let frameIndex = 0;
        frameIndex < frameCount;
        frameIndex++
    ) {
        channelData[frameIndex] =
            audioView.getInt16(
                frameIndex * 2,
                true
            ) / 32768;
    }


    return audioBuffer;
}


async function speakText(
    text,
    pitch = 0.5,
    speed = 1
) {

    const numericPitch =
        Math.min(
            1,
            Math.max(0, Number(pitch))
        );

    const numericSpeed =
        Math.min(
            1,
            Math.max(0, Number(speed))
        );


    if (
        !Number.isFinite(numericPitch) ||
        !Number.isFinite(numericSpeed)
    ) {
        throw new Error(
            "speak pitch and speed must be numbers between 0 and 1."
        );
    }


    const response =
        await fetch(
            `${geminiTtsEndpoint}?key=${geminiApiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text:
                                        `Read this text aloud. Use a pitch of ${numericPitch} and a speaking speed of ${numericSpeed}. Text: ${text}`
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: "Kore"
                                }
                            }
                        }
                    }
                })
            }
        );


    if (!response.ok) {
        throw new Error(
            `Gemini TTS request failed (${response.status})`
        );
    }


    const responseData =
        await response.json();

    const audioPart =
        responseData.candidates?.[0]
            ?.content?.parts?.find(
                part => part.inlineData
            )?.inlineData;


    if (!audioPart?.data) {
        throw new Error(
            "Gemini TTS returned no audio."
        );
    }


    const sampleRateMatch =
        audioPart.mimeType?.match(
            /rate=(\d+)/i
        );

    const sampleRate =
        Number(sampleRateMatch?.[1]) || 24000;


    if (!speechAudioContext) {
        speechAudioContext =
            new (window.AudioContext ||
                window.webkitAudioContext)();
    }


    await speechAudioContext.resume();

    const audioBuffer =
        decodeBase64Pcm(
            audioPart.data,
            sampleRate
        );

    const source =
        speechAudioContext.createBufferSource();

    source.buffer = audioBuffer;
    source.connect(
        speechAudioContext.destination
    );


    await new Promise(
        resolve => {
            source.addEventListener(
                "ended",
                resolve,
                { once: true }
            );
            source.start();
        }
    );
}


function startSpeech(
    text,
    pitch,
    speed
) {

    const speechPromise =
        speakText(
            text,
            pitch,
            speed
        ).catch(
            error => {
                console.error(error);
                errorElement.textContent =
                    "Speech error:\n" +
                    error.message;
            }
        );


    activeSpeech.add(
        speechPromise
    );

    speechPromise.finally(
        () => activeSpeech.delete(
            speechPromise
        )
    );
}


function waitForScriptedRotations(
    waitTime = 1,
    executionId = pythonExecutionId
) {
    const duration =
        Number(waitTime);

    if (
        !Number.isFinite(duration) ||
        duration < 0
    ) {
        return Promise.reject(
            new Error(
                "wait time must be a non-negative number."
            )
        );
    }

    const startTime =
        waveClock.getElapsedTime();

    return new Promise(
        resolve => {

            function checkRotations() {

                /*
                 * The script was cancelled.
                 * Stop waiting immediately.
                 */
                if (
                    executionId !==
                    pythonExecutionId
                ) {
                    resolve(false);
                    return;
                }

                const elapsedTime =
                    waveClock.getElapsedTime() -
                    startTime;

                if (
                    scriptedRotations.length === 0 &&
                    activeSpeech.size === 0 &&
                    elapsedTime >= duration
                ) {
                    resolve(true);
                    return;
                }

                requestAnimationFrame(
                    checkRotations
                );
            }

            checkRotations();
        }
    );
}


function tryGrabObject(
    side
) {

    if (
        !handCanGrab[side] ||
        handIsHolding[side]
    ) {
        return false;
    }


    const hand =
        armJoints[`XYZ-hand${side}`];


    if (
        !hand
    ) {
        return false;
    }


    modelRoot.updateMatrixWorld(
        true
    );


    const handPosition =
        new THREE.Vector3();

    hand.getWorldPosition(
        handPosition
    );


    for (
        const object of grabbableObjects
    ) {

        if (
            !object.userData.canGrab ||
            object.userData.grabbedBy
        ) {
            continue;
        }


        const objectBounds =
            new THREE.Box3()
                .setFromObject(object);
        const objectPosition =
            objectBounds.getCenter(
                new THREE.Vector3()
            );
        const grabDistance =
            handPosition.distanceTo(
                objectPosition
            );


        if (
            grabDistance > 10
        ) {
            continue;
        }


        hand.attach(
            object
        );
        object.userData.grabbedBy =
            side;
        handIsHolding[side] = true;
        return true;
    }


    return false;
}


async function runPythonSource(
    source,
    inheritedExecutionId = null,
    definitions = null
) {

    const executionId =
        inheritedExecutionId ??
        ++pythonExecutionId;

    resetAnimation = null;

    if (definitions === null) {
        definitions =
            extractScriptDefinitions(source);
    }

    const calls =
        extractScriptCalls(source);

    let callCount = 0;

    for (const call of calls) {
        if (
            executionId !==
            pythonExecutionId
        ) {
            return 0;
        }

        const {
            functionName,
            argumentText,
            index: callStart,
            length: callLength
        } = call;

        const lineStart =
            source.lastIndexOf("\n", callStart) + 1;


        if (
            /^\s*def\s+/.test(
                source.slice(
                    lineStart,
                    callStart
                )
            )
        ) {
            continue;
        }


        codeInspectorContent.value =
            source.slice(
                0,
                callStart + callLength
            );
        codeInspectorContent.scrollTop =
            codeInspectorContent.scrollHeight;

        const parsedArguments =
            getScriptArguments(argumentText);

        const positional = parsedArguments.positional

        if (functionName === "rotatePart") {
            const [partName, axis, degree, positionalTime] =
                parsedArguments.positional;

            scheduleRotatePart(
                partName,
                axis,
                degree,
                parsedArguments.values.time ?? positionalTime
            );
        } else if (functionName === "define") {
            const varName = positional[0];
            const varType = positional[1];
            const value = positional.length >= 3
                ? positional[2]
                : undefined;

            if (varName === undefined) {
                throw new Error(
                    "define() requires a variable name."
                );
            }

            if (varType === undefined) {
                throw new Error(
                    "define() requires a variable type."
                );
            }

            defineVariable(varName, varType, value);
        }

        else if (functionName === "change") {
            const rawArguments = splitScriptArguments(argumentText);

            if (rawArguments.length < 2) {
                throw new Error(
                    "change() requires a variable name and a new value."
                );
            }

            const varName = parseScriptValue(rawArguments[0]);

            let newValue = rawArguments[1].trim();

            /*
            * If the expression was written as:
            *
            * change("a", "a+1")
            *
            * remove the surrounding quotes so that the expression
            * evaluator receives:
            *
            * a+1
            */
            if (
                (newValue.startsWith('"') && newValue.endsWith('"')) ||
                (newValue.startsWith("'") && newValue.endsWith("'"))
            ) {
                newValue = newValue.slice(1, -1);
            }

            if (varName === undefined) {
                throw new Error(
                    "change(): invalid variable name."
                );
            }

            changeVariable(varName, newValue);
        } else if (
            functionName === "cyclicMovement"
        ) {
            const [jointName, axis, amplitude, speed, phase, positionalOffset] =
                parsedArguments.positional;

            scheduleCyclicMovement(
                jointName,
                axis,
                amplitude,
                speed,
                phase,
                parsedArguments.values.offset ?? positionalOffset
            );
        } else if (
            functionName === "reset"
        ) {
            startResetAnimation();
        } else if (
            functionName === "openHand"
        ) {
            openHand(
                parsedArguments.positional[0]
            );
        } else if (
            functionName === "closeHand"
        ) {
            closeHand(
                parsedArguments.positional[0]
            );
        } else if (
            functionName === "wait"
        ) {
            await waitForScriptedRotations(
                parsedArguments.values.time ??
                    parsedArguments.positional[0]
            );
        } else if (
            functionName === "speak"
        ) {
            startSpeech(
                parsedArguments.positional[0],
                parsedArguments.values.pitch ??
                    parsedArguments.positional[1],
                parsedArguments.values.speed ??
                    parsedArguments.positional[2]
            );
        } else if (
            functionName === "log"
        ) {
            printList(consoleOutput, [parsedArguments.positional[0]]);
        } else if (functionName === "subroutine") {
            const {
                script,
                repeat,
                condition
            } = parseSubroutineArguments(
                argumentText
            );

            await runSubroutine(
                script,
                repeat,
                condition,
                executionId,
                definitions
            );

            if (
                executionId !==
                pythonExecutionId
            ) {
                return 0;
            }
        }


        callCount++;
    }


    if (
        callCount === 0
    ) {
        throw new Error(
            "No supported animation or speech calls found."
        );
    }


    return callCount;
}


function animateScriptedMovements(
    time
) {

    for (
        let index = scriptedRotations.length - 1;
        index >= 0;
        index--
    ) {

        const movement =
            scriptedRotations[index];

        const progress =
            Math.min(
                1,
                (time - movement.startTime) /
                    movement.duration
            );


        movement.joint.rotation[
            movement.axis
        ] = clampJointRotation(
            THREE.MathUtils.lerp(
                movement.start,
                movement.target,
                progress
            )
        );

        clampJoint(
            movement.joint
        );


        if (
            progress >= 1
        ) {
            scriptedRotations.splice(index, 1);
        }
    }


    for (
        const movement of scriptedCycles
    ) {
        rotateArmJoint(
            movement.jointName,
            movement.axis,
            movement.offset +
                Math.sin(
                    time * movement.speed +
                    movement.phase
                ) * movement.amplitude
        );
    }
}

// region Animation

function animateWave(
    time,
    side
) {

    const waveJoints = [
        [`X-Shoulder${side}`, "x", 0.12, 2.4, 0],
        [`YZ-upperArm${side}`, "y", -0.22, 2.4, 0.55, 0.05],
        [`Z-forearm${side}`, "z", -0.5, 4.8, 0.5],
        [`XYZ-hand${side}`, "z", -0.5, 4.8, 0.5]
    ];


    for (
        const [jointName, axis, amplitude, speed, phase, offset = 0]
        of waveJoints
    ) {

        rotateArmJoint(
            jointName,
            axis,
            offset +
            Math.sin(time * speed + phase) * amplitude
        );
    }
}


function startResetAnimation() {

    lWaveAnimationEnabled = false;
    rWaveAnimationEnabled = false;
    scriptedRotations.length = 0;
    scriptedCycles.length = 0;
    handCanGrab.L = false;
    handCanGrab.R = false;


    const joints =
        Object.values(
            armJoints
        ).map(
            joint => ({
                joint,
                start: joint.rotation.clone(),
                target: joint.userData.tPoseRotation.clone()
            })
        );


    for (
        const side of ["L", "R"]
    ) {
        if (
            handIsHolding[side]
        ) {
            continue;
        }

        const thumb = thumbJoints[side];

        if (thumb) {
            joints.push({
                joint: thumb,
                start: thumb.rotation.clone(),
                target: thumb.userData.tPoseRotation.clone()
            });
        }
    }


    resetAnimation = {
        startTime: waveClock.getElapsedTime(),
        duration: 0.8,
        joints
    };
}


function fullResetScene() {

    pythonExecutionId++;
    resetAnimation = null;
    lWaveAnimationEnabled = false;
    rWaveAnimationEnabled = false;
    scriptedRotations.length = 0;
    scriptedCycles.length = 0;


    for (
        const side of ["L", "R"]
    ) {
        handCanGrab[side] = false;
        handIsHolding[side] = false;
    }


    rebuildModel();
}


function animateReset(
    time
) {

    const progress =
        Math.min(
            1,
            (time - resetAnimation.startTime) /
                resetAnimation.duration
        );


    const easedProgress =
        progress *
        progress *
        (3 - 2 * progress);


    for (
        const entry of resetAnimation.joints
    ) {

        entry.joint.rotation.x =
            THREE.MathUtils.lerp(
                entry.start.x,
                entry.target.x,
                easedProgress
            );

        entry.joint.rotation.y =
            THREE.MathUtils.lerp(
                entry.start.y,
                entry.target.y,
                easedProgress
            );

        entry.joint.rotation.z =
            THREE.MathUtils.lerp(
                entry.start.z,
                entry.target.z,
                easedProgress
            );

        clampJoint(
            entry.joint
        );
    }


    if (
        progress >= 1
    ) {
        resetAnimation = null;
    }
}


/* ============================================================
 *
 * FRAME MODEL
 *
 * ============================================================ */


function frameModel() {

    const box =
        new THREE.Box3()
            .setFromObject(
                modelRoot
            );


    if (
        box.isEmpty()
    ) {

        return;
    }


    const center =
        box.getCenter(
            new THREE.Vector3()
        );


    const size =
        box.getSize(
            new THREE.Vector3()
        );


    /*
     * Move the model's visual center
     * to the origin.
     */

    modelRoot.position.sub(
        center
    );


    modelRoot.rotation.y =
        0;


    const largestDimension =
        Math.max(
            size.x,
            size.y,
            size.z
        );


    if (
        largestDimension <= 0
    ) {

        return;
    }


    /*
     * Make the model approximately 10 units
     * across.

     */

    const targetSize = 20;


    modelRoot.scale.setScalar(
        targetSize /
        largestDimension
    );


    /*
     * Reset camera.

     */

    modelRoot.updateMatrixWorld(
        true
    );


    const framedBox =
        new THREE.Box3()
            .setFromObject(
                modelRoot
            );


    const framedCenter =
        framedBox.getCenter(
            new THREE.Vector3()
        );


    const framedSize =
        framedBox.getSize(
            new THREE.Vector3()
        );


    const framedDimension =
        Math.max(
            framedSize.x,
            framedSize.y,
            framedSize.z
        );


    const viewDistance =
        framedDimension /
        (2 * Math.tan(
            THREE.MathUtils.degToRad(
                camera.fov
            ) / 2
        )) *
        0.95;


    camera.position.copy(
        framedCenter
    );


    camera.position.add(
        new THREE.Vector3(
            1,
            0.75,
            1
        ).normalize().multiplyScalar(
            viewDistance
        )
    );


    camera.lookAt(
        framedCenter
    );


    controls.target.copy(
        framedCenter
    );


    controls.update();
}


/* ============================================================
 *
 * COUNT GROUPS
 *
 * ============================================================ */


function countGroups(
    groups
) {

    let count = 0;


    function countFunc(
        group
    ) {

        count++;


        if (
            !group.children
        ) {
            return;
        }


        for (
            const child of group.children
        ) {

            if (
                typeof child === "object" &&
                !Array.isArray(child)
            ) {

                /*
                 * Only count actual group objects
                 * from the JSON structure.
                 */

                if (
                    child.name &&
                    Array.isArray(
                        child.children
                    )
                ) {

                    countFunc(
                        child
                    );
                }
            }
        }
    }


    for (
        const group of groups
    ) {

        countFunc(
            group
        );
    }


    return count;
}

function getGroupNames(groups) {
    return groups.flatMap(group => [
        group.name || "Unnamed group",
        ...getGroupNames(
            (group.children || []).filter(
                child => typeof child === "object"
            )
        )
    ]);
}


/* ============================================================
 *
 * RESIZE
 *
 * ============================================================ */


window.addEventListener(
    "resize",
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;


        camera.updateProjectionMatrix();


        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );


        positionCodeInspector();
    }
);


window.addEventListener(
    "pointermove",
    event => {

        const shouldLookRight =
            event.clientX >
            window.innerWidth / 2;


        if (
            shouldLookRight === eyesLookingRight
        ) {
            return;
        }


        eyesLookingRight =
            shouldLookRight;


        setEyeGaze(
            eyesLookingRight
        );
    }
);


/* ============================================================
 *
 * RENDER LOOP
 *
 * ============================================================ */


function animate() {

    requestAnimationFrame(
        animate
    );


    const time =
        waveClock.getElapsedTime();


    if (resetAnimation) {

        animateReset(
            time
        );

    } else {

        animateScriptedMovements(
            time
        );

        if (lWaveAnimationEnabled) {

            animateWave(
                time,
                "L"
            );
        }

        if (rWaveAnimationEnabled) {

            animateWave(
                time,
                "R"
            );
        }
    }

    /*
     * Hard safety pass: every registered joint is guaranteed to
     * remain within -90° .. +90° on all three axes, regardless of
     * which animation or command changed it.
     */
    for (const joint of Object.values(armJoints)) {
        clampJoint(joint);
    }

    for (const joint of Object.values(thumbJoints)) {
        clampJoint(joint);
    }


    controls.update();


    for (
        const line of groupHighlightLines
    ) {

        const sourceMesh =
            line.userData.sourceMesh;


        if (
            sourceMesh
        ) {
            sourceMesh.updateWorldMatrix(
                true,
                false
            );
            line.matrix.copy(
                sourceMesh.matrixWorld
            );
            line.matrixWorldNeedsUpdate =
                true;
        }
    }


    cameraInfo.textContent =
        "Camera: " +
        camera.position.x.toFixed(2) +
        ", " +
        camera.position.y.toFixed(2) +
        ", " +
        camera.position.z.toFixed(2);


    renderer.render(
        scene,
        camera
    );
}

function printPartList(targetElement, list) {
    list.forEach(
        groupName => {
            const listItem =
                document.createElement("p");

            listItem.textContent =
                `> ${groupName}`;
            listItem.addEventListener(
                "mouseenter",
                () => showGroupHighlight(groupName)
            );
            listItem.addEventListener(
                "mouseleave",
                clearGroupHighlight
            );
            targetElement.appendChild(
                listItem
            );
        }
    );
}

function printList(targetElement, list) {
    list.forEach(
        elem => {
            const listItem = document.createElement("p");
            listItem.innerHTML = `> ${elem}`;
            targetElement.appendChild(
                listItem
            );
        }
    );
}

function clearGroupHighlight() {

    while (
        groupHighlightLines.length > 0
    ) {
        const line =
            groupHighlightLines.pop();

        line.parent?.remove(
            line
        );
        line.geometry.dispose();
    }
}


function showGroupHighlight(
    groupName
) {

    clearGroupHighlight();


    const group =
        armJoints[groupName];


    if (
        !group
    ) {
        return;
    }


    const groupMeshes = [];


    group.traverse(
        child => {

            if (
                child.isMesh
            ) {
                groupMeshes.push(
                    child
                );
            }
        }
    );


    for (
        const mesh of groupMeshes
    ) {
        const line =
            new THREE.LineSegments(
                new THREE.EdgesGeometry(
                    mesh.geometry
                ),
                groupHighlightMaterial
            );

        line.renderOrder = 10000;
        line.frustumCulled = false;
        line.matrixAutoUpdate = false;
        line.userData.sourceMesh = mesh;
        mesh.updateWorldMatrix(
            true,
            false
        );
        line.matrix.copy(
            mesh.matrixWorld
        );
        scene.add(
            line
        );
        groupHighlightLines.push(
            line
        );
    }
}

pythonFileInput.addEventListener("change", async () => {
    const [file] = pythonFileInput.files;

    if (!file) {
        return;
    }

    if (!file.name.toLowerCase().endsWith(".py")) {
        errorElement.textContent = "SCRIPT LOAD requires a Python (.py) file.";
        pythonFileInput.value = "";
        return;
    }

    try {
        const source = await file.text();

        loadedPythonFiles.set(
            file.name,
            {
                file,
                source
            }
        );
        inspectedPythonFile = file.name;

        consoleOutput.textContent =
            `Loaded ${file.name} (${source.length} characters).`;
        errorElement.textContent = "";
    } catch (error) {
        errorElement.textContent =
            "Could not read the Python file:\n" +
            error.message;
    }

    pythonFileInput.value = "";
});


async function loadDefaultPythonFile() {

    try {
        let source;


        if (
            window.location.protocol === "file:"
        ) {
            source = await new Promise(
                (resolve, reject) => {
                    const request =
                        new XMLHttpRequest();

                    request.open(
                        "GET",
                        "test.py",
                        true
                    );

                    request.onload =
                        () => {
                            if (
                                request.status === 0 ||
                                (request.status >= 200 &&
                                    request.status < 300)
                            ) {
                                resolve(
                                    request.responseText
                                );
                            } else {
                                reject(
                                    new Error(
                                        `Could not load test.py (${request.status})`
                                    )
                                );
                            }
                        };

                    request.onerror =
                        () => reject(
                            new Error(
                                "Could not load test.py"
                            )
                        );

                    request.send();
                }
            );
        } else {
            const response =
                await fetch("test.py");


            if (
                !response.ok
            ) {
                throw new Error(
                    `Could not load test.py (${response.status})`
                );
            }


            source =
                await response.text();
        }


        loadedPythonFiles.set(
            "test.py",
            {
                file: null,
                source
            }
        );
        inspectedPythonFile = "test.py";
    } catch (error) {
        errorElement.textContent =
            "Could not load default test.py:\n" +
            error.message;
    }
}


loadDefaultPythonFile();


function downloadFile(
    blob,
    fileName
) {

    const link =
        document.createElement("a");

    link.href =
        URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
}


function getCrc32(
    bytes
) {

    let crc = 0xffffffff;


    for (
        const byte of bytes
    ) {
        crc ^= byte;

        for (
            let bit = 0;
            bit < 8;
            bit++
        ) {
            crc =
                (crc >>> 1) ^
                (crc & 1
                    ? 0xedb88320
                    : 0);
        }
    }


    return (
        crc ^ 0xffffffff
    ) >>> 0;
}


function writeZipNumber(
    view,
    offset,
    value,
    byteLength
) {

    if (
        byteLength === 2
    ) {
        view.setUint16(
            offset,
            value,
            true
        );
    } else {
        view.setUint32(
            offset,
            value,
            true
        );
    }
}


function createPythonZip(
    files
) {

    const encoder =
        new TextEncoder();
    const chunks = [];
    const centralDirectory = [];
    let offset = 0;


    for (
        const [fileName, source] of files
    ) {
        const nameBytes =
            encoder.encode(fileName);
        const sourceBytes =
            encoder.encode(source);
        const header =
            new Uint8Array(30 + nameBytes.length);
        const headerView =
            new DataView(header.buffer);

        writeZipNumber(headerView, 0, 0x04034b50, 4);
        writeZipNumber(headerView, 4, 20, 2);
        writeZipNumber(headerView, 6, 0x800, 2);
        writeZipNumber(headerView, 8, 0, 2);
        writeZipNumber(headerView, 14, getCrc32(sourceBytes), 4);
        writeZipNumber(headerView, 18, sourceBytes.length, 4);
        writeZipNumber(headerView, 22, sourceBytes.length, 4);
        writeZipNumber(headerView, 26, nameBytes.length, 2);
        header.set(nameBytes, 30);

        chunks.push(header, sourceBytes);

        const centralEntry =
            new Uint8Array(46 + nameBytes.length);
        const centralView =
            new DataView(centralEntry.buffer);

        writeZipNumber(centralView, 0, 0x02014b50, 4);
        writeZipNumber(centralView, 4, 20, 2);
        writeZipNumber(centralView, 6, 20, 2);
        writeZipNumber(centralView, 8, 0x800, 2);
        writeZipNumber(centralView, 10, 0, 2);
        writeZipNumber(centralView, 16, getCrc32(sourceBytes), 4);
        writeZipNumber(centralView, 20, sourceBytes.length, 4);
        writeZipNumber(centralView, 24, sourceBytes.length, 4);
        writeZipNumber(centralView, 28, nameBytes.length, 2);
        writeZipNumber(centralView, 42, offset, 4);
        centralEntry.set(nameBytes, 46);
        centralDirectory.push(centralEntry);

        offset += header.length + sourceBytes.length;
    }


    const centralDirectoryOffset = offset;
    const centralDirectorySize =
        centralDirectory.reduce(
            (size, entry) => size + entry.length,
            0
        );
    const endRecord =
        new Uint8Array(22);
    const endView =
        new DataView(endRecord.buffer);

    writeZipNumber(endView, 0, 0x06054b50, 4);
    writeZipNumber(endView, 8, files.length, 2);
    writeZipNumber(endView, 10, files.length, 2);
    writeZipNumber(endView, 12, centralDirectorySize, 4);
    writeZipNumber(endView, 16, centralDirectoryOffset, 4);

    return new Blob(
        [...chunks, ...centralDirectory, endRecord],
        { type: "application/zip" }
    );
}


function savePythonFiles() {

    const files =
        [...loadedPythonFiles.entries()].map(
            ([fileName, storedFile]) => [
                fileName,
                storedFile.source
            ]
        );


    if (
        files.length === 0
    ) {
        errorElement.textContent =
            "No Python files loaded.";
        return;
    }


    downloadFile(
        createPythonZip(files),
        "python-scripts.zip"
    );
    consoleOutput.textContent =
        `Saved ${files.length} Python file(s) as python-scripts.zip.`;
}


function saveCurrentPythonFile() {

    const fileName =
        inspectedPythonFile;
    const storedFile =
        fileName && loadedPythonFiles.get(fileName);


    if (
        !storedFile
    ) {
        errorElement.textContent =
            "No Python file is currently in use.";
        return;
    }


    downloadFile(
        new Blob(
            [storedFile.source],
            { type: "text/x-python" }
        ),
        fileName.toLowerCase().endsWith(".py")
            ? fileName
            : `${fileName}.py`
    );
    consoleOutput.textContent =
        `Saved ${fileName}.`;
}


function createNewPythonFile(
    requestedName
) {

    let fileName =
        requestedName.trim() ||
        "script.py";


    if (
        !fileName.toLowerCase().endsWith(".py")
    ) {
        fileName += ".py";
    }


    const fileStem =
        fileName.slice(
            0,
            -3
        );
    let fileNumber = 2;


    while (
        loadedPythonFiles.has(fileName)
    ) {
        fileName =
            `${fileStem}_${fileNumber}.py`;
        fileNumber++;
    }


    loadedPythonFiles.set(
        fileName,
        {
            file: null,
            source: ""
        }
    );


    inspectedPythonFile = fileName;
    codeInspectorTitle.textContent =
        `New Python file: ${fileName}`;
    codeInspectorContent.value = "";
    codeInspectorContent.readOnly = false;
    pushCodeModification.disabled = false;
    consoleOutput.textContent =
        `Created ${fileName}.`;
}

function editPythonFile(
    requestedName
) {

    let fileName = requestedName.trim()
    let storedFile = loadedPythonFiles.get(fileName);

    if (
        !fileName.toLowerCase().endsWith(".py")
    ) {
        fileName += ".py";
    }

    inspectedPythonFile = fileName;
    codeInspectorTitle.textContent =
        `Inspecting: ${fileName}`;
    codeInspectorContent.value = storedFile.source;
    codeInspectorContent.readOnly = false;
    pushCodeModification.disabled = false;
    consoleOutput.textContent =
        `Editing ${fileName}.`;
}


pushCodeModification.addEventListener(
    "click",
    () => {
        if (
            executingPythonFile ||
            !inspectedPythonFile
        ) {
            return;
        }


        const storedFile =
            loadedPythonFiles.get(
                inspectedPythonFile
            );


        if (!storedFile) {
            return;
        }


        storedFile.source =
            codeInspectorContent.value;
        consoleOutput.textContent =
            `Updated ${inspectedPythonFile}.`;
    }
);

function executeConsoleCommand() {
    const commandText = consoleInput.value.trim();


    if (!commandText) {
        consoleOutput.textContent = "";
        return;
    }


    commandHistory.push(commandText);
    commandHistoryIndex = -1;
    commandHistoryDraft = "";
    consoleOutput.innerHTML = "";
    errorElement.innerHTML = ""
    let command = commandText.split(" ");
    switch (command[0].toUpperCase()) {
        case "SCRIPT": {
            const scriptCommand =
                command[1]?.toUpperCase();

            if (
                scriptCommand === "LOAD"
            ) {
                pythonFileInput.click();
            } else if (
                scriptCommand === "SAVE"
            ) {
                savePythonFiles();
            } else if (
                scriptCommand === "SAVETHIS"
            ) {
                saveCurrentPythonFile();
            } else if (
                scriptCommand === "NEW"
            ) {
                createNewPythonFile(
                    command.slice(2).join(" ")
                );
            } else if (
                scriptCommand === "EDIT"
            ) {
                if (command.slice(2).join(" ") != "") {
                    editPythonFile(
                        command.slice(2).join(" ")
                    )
                } else {
                    errorElement.textContent = "Select a script to edit. Run \"RUN\" to list all scripts."
                }
            } else {
                errorElement.textContent = "SCRIPT requires LOAD, SAVE, SAVETHIS, EDIT, or NEW.";
            }
            break;
        }
        case "RUN": {
            if (!command[1]) {
                consoleOutput.textContent =
                    [...loadedPythonFiles.keys()].join("\n") ||
                    "No Python files loaded.";
                break;
            }

            const fileName =
                command.slice(1).join(" ");
            const storedFile =
                loadedPythonFiles.get(fileName);


            if (!storedFile) {
                errorElement.textContent =
                    `Python file not loaded: ${fileName}`;
                break;
            }


            if (
                executingPythonFile
            ) {
                errorElement.textContent =
                    `Already running ${executingPythonFile}.`;
                break;
            }


            codeInspectorTitle.textContent =
                `Latest Python file: ${fileName}`;
            codeInspectorContent.value = "";
            codeInspectorContent.readOnly = true;
            pushCodeModification.disabled = true;
            executingPythonFile = fileName;
            inspectedPythonFile = fileName;


            runPythonSource(
                storedFile.source
            ).then(
                callCount => {
                    codeInspectorContent.value =
                        storedFile.source;
                    codeInspectorContent.readOnly = false;
                    pushCodeModification.disabled = false;
                    executingPythonFile = null;
                    alert(`${fileName} ran successfully (${callCount} movement calls).`);
                }
            ).catch(
                error => {
                    codeInspectorContent.value =
                        storedFile.source;
                    codeInspectorContent.readOnly = false;
                    pushCodeModification.disabled = false;
                    executingPythonFile = null;
                    errorElement.textContent =
                        `Could not run ${fileName}:\n` +
                        error.message;
                }
            );
            break;
        }
        case "SETHAND": {
            const handSide =
                command[1]?.toUpperCase();
            const handCommand =
                command[2]?.toUpperCase();

            if (
                (handCommand === "OPEN" ||
                    handCommand === "CLOSE") &&
                (handSide?.includes("L") ||
                    handSide?.includes("R"))
            ) {
                if (handCommand === "OPEN") {
                    openHand(handSide);
                } else {
                    closeHand(handSide);
                }
            } else {
                errorElement.textContent =
                    "SETHAND requires a side and OPEN or CLOSE.";
            }
            break;
        }
        case "DEBUG": {
            if (command[1]?.toUpperCase() == "SHOW") {
                modelInfo.hidden = false;
                cameraInfo.hidden = false;
            } else if (command[1]?.toUpperCase() == "HIDE") {
                modelInfo.hidden = true;
                cameraInfo.hidden = true;  
            }
            break;
        }
        case "WAVE": {
            if (command[1]?.toUpperCase() == "R") {
                resetAnimation = null;
                rWaveAnimationEnabled = true;
            } else if (command[1]?.toUpperCase() == "L") {
                resetAnimation = null;
                lWaveAnimationEnabled = true;
            }
            break;
        }
        case "LIST": {
            let groupList = getGroupNames(modelData.groups || []);
            consoleOutput.innerHTML = "Axis of rotation - Part name";
            printPartList(consoleOutput, groupList);
            break;
        }
        case "VARS": {
            let variables = [];
            for (let index = 0; index < Object.keys(scriptVariables).length; index++) {
                const key = Object.keys(scriptVariables)[index];
                const val = Object.values(scriptVariables)[index];
                variables.push(key.split(";")[0]+": "+key.split(";")[1]+" = "+val);
            };
            printList(consoleOutput, variables);
            break;
        }
        case "RESET": {
            startResetAnimation();
            break;
        }
        case "FRESET": {
            for (const key of Object.keys(scriptVariables)) {
                delete scriptVariables[key];
            }
            fullResetScene();
            break;
        }
        case "HELP": {
            const manual = [
                "DEBUG [SHOW/HIDE] - Shows/Hides debug info",
                "LIST - Lists all parts of the robot that can be moved",
                "RESET - Resets every part of the robot",
                "FRESET - Resets every part of the scene",
                "WAVE [L/R] - Waves the robot's Left/Right hand",
                "SETHAND [L/R/LR] [OPEN/CLOSE]- Sets the robot's Left/Right/Both hand(s) open/closed.",
                "SCRIPT LOAD - Loads python script from file manager",
                "SCRIPT NEW [name] - Creates new script that can be edited in the inspector",
                "SCRIPT SAVE - Saves all scripts into a .zip file",
                "SCRIPT SAVETHIS - Saves the currently opened script as a .py file",
                "RUN - Lists all loaded scripts ready for execution",
                "RUN [script name] - Runs the given script. \"test.py\" is included in the app by default.",
                "FUNCHELP - Instructions to how the functions used to control the robot work.",
                "SCRIPTHELP - Instructions to how the scripting language of the website works."
            ]
            printList(consoleOutput, manual)
            break;
        }
        case "FUNCHELP": {
            const manual = [
                "log(msg:string):",
                "- logs a message to the console output",
                "rotatePart(partName:string, axis:string, degree:float, timeFactor:float=1):",
                "- Rotates [partName] on [axis] by [degree] with [timeFactor].",
                "- timeFactor is an optional argument. 1 means a 360° rotation would take 1 second.",
                "cyclicMovement(partName:string, axis:string, amplitude:float, speed:float, phase:float, offset:float=0):",
                "- Defines a continuous rotation (such as constant waving) of [partName] on [axis] by [amplitude] with [speed] and [phase].",
                "- offset is an optional argument. Defines the starting point of the rotation.",
                "reset():",
                "- Resets all parts of the robot to their initial position and rotation.",
                "openHand(side:string):",
                "- Opens [side] palm of the robot.",
                "closeHand(side:string):",
                "- Closes [side] palm of the robot, allowing it to grab objects.",
                "wait(time:float=0):",
                "- Waits until all movements finish before the function, plus an additional [time] seconds.",
                "speak(text:string, pitch:float=1, speed:float=1):",
                "- Speaks [text] with [pitch] at [speed], using Gemini's TTS API.",
                "- NOTE: the license of the app is very limited.",
                "define(varName:string, varType:string, value:any):",
                "- Creates a new variable called [varName] of [varType] (num/text/logic), with [value].",
                "- The assigned value must match the type of the variable (eg. num cannot be \"Hi!\")",
                "change(varName:string, newValue:any):",
                "- Changes [varName] to [newValue] of the appropriate type.",
                "subroutine(script:string, repeat:boolean, condition:boolean):",
                "- Runs [script] as a subroutine of the program, halting the execution of every other process.",
                "- If [repeat] is TRUE, the execution will loop, which it is not by default.",
                "- The execution will only commence if [condition] is TRUE, which it is by default.",
            ]
            printList(consoleOutput, manual)
            break;
        }
        case "SCRIPTHELP": {
            const manual = [
                "Every instruction should be written with line breaks seperating them, similarly to python code.",
                "Variables can be referred to as parameters (log(myNumber) will log the variable myNumber if it was  defined earlier.)",
                "All basic mathematical operators, parentheses, and comparators featured in python are supported.",
                "The supported logical operators are NOT, AND, and OR.",
                "Subroutines can be defined in seperate scripts, but using a \"def mySubroutine():\" notation with nested code is also supported.",
            ]
            printList(consoleOutput, manual)
            break;
        }
        default: {
            errorElement.innerHTML = "Type HELP for the full list of commands."
            break;
        }
    }
    consoleInput.value = "";
}


consoleExecute.addEventListener(
    "click",
    executeConsoleCommand
);


consoleInput.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Enter"
        ) {
            event.preventDefault();
            executeConsoleCommand();
            return;
        }


        if (
            event.key === "ArrowUp"
        ) {
            event.preventDefault();

            if (
                commandHistory.length === 0
            ) {
                return;
            }


            if (
                commandHistoryIndex === -1
            ) {
                commandHistoryDraft = consoleInput.value;
            }


            commandHistoryIndex = Math.min(
                commandHistoryIndex + 1,
                commandHistory.length - 1
            );
            consoleInput.value =
                commandHistory[
                    commandHistory.length -
                    1 -
                    commandHistoryIndex
                ];
        } else if (
            event.key === "ArrowDown"
        ) {
            event.preventDefault();

            if (
                commandHistoryIndex === -1
            ) {
                return;
            }


            commandHistoryIndex--;

            if (
                commandHistoryIndex === -1
            ) {
                consoleInput.value = commandHistoryDraft;
            } else {
                consoleInput.value =
                    commandHistory[
                        commandHistory.length -
                        1 -
                        commandHistoryIndex
                    ];
            }
        }
    }
);

animate();
