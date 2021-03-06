// Copyright 2016 The Draco Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
'use strict';

const DracoModule = Module;

THREE.DRACOLoader = function (manager) {
    this.manager = (manager !== undefined) ? manager :
        THREE.DefaultLoadingManager;
    this.materials = null;
};

THREE.DRACOLoader.prototype = {

    constructor: THREE.DRACOLoader,

    load: function (url, onLoad, onProgress, onError) {
        const scope = this;
        const loader = new THREE.FileLoader(scope.manager);
        loader.setPath(this.path);
        loader.setResponseType('arraybuffer');
        loader.load(url, function (blob) {
            onLoad(scope.decodeDracoFile(blob));
        }, onProgress, onError);
    },

    setPath: function (value) {
        this.path = value;
    },

    decodeDracoFile: function (rawBuffer) {
        const fromRawBufferTime = performance.now();

        const scope = this;
        /*
         * Here is how to use Draco Javascript decoder and get the bufferGeometry.
         */
        const buffer = new DracoModule.DecoderBuffer();
        buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
        const wrapper = new DracoModule.WebIDLWrapper();

        /*
         * Determine what type is this file, mesh or point cloud.
         */
        const geometryType = wrapper.GetEncodedGeometryType(buffer);
        if (geometryType == DracoModule.TRIANGULAR_MESH) {
            fileDisplayArea.innerText = "Loaded a mesh.\n";
        } else if (geometryType == DracoModule.POINT_CLOUD) {
            fileDisplayArea.innerText = "Loaded a point cloud.\n";
        } else {
            const errorMsg = "Error: Unknown bufferGeometry type.";
            fileDisplayArea.innerText = errorMsg;
            throw new Error(errorMsg);
        }

        fileDisplayArea.innerText += "From raw buf: " + (performance.now() - fromRawBufferTime) + "\n";

        return scope.convertDracoGeometryToMsg(wrapper, geometryType, buffer);
    },

    convertDracoGeometryToMsg: function (wrapper, geometryType, buffer) {
        let dracoGeometry;
        const start_time = performance.now();
        if (geometryType == DracoModule.TRIANGULAR_MESH) {
            dracoGeometry = wrapper.DecodeMeshFromBuffer(buffer);
        } else {
            dracoGeometry = wrapper.DecodePointCloudFromBuffer(buffer);
        }
        const decode_end = performance.now();
        DracoModule.destroy(buffer);
        /*
         * Example on how to retrieve mesh and attributes.
         */
        let numFaces, numPoints;
        let numVertexCoordinates, numTextureCoordinates, numAttributes;
        // For output basic bufferGeometry information.
        let geometryInfoStr;
        if (geometryType == DracoModule.TRIANGULAR_MESH) {
            numFaces = dracoGeometry.num_faces();
            geometryInfoStr += "Number of faces loaded: " + numFaces.toString()
                + ".\n";
        } else {
            numFaces = 0;
        }
        numPoints = dracoGeometry.num_points();
        numVertexCoordinates = numPoints * 3;
        numTextureCoordinates = numPoints * 2;
        numAttributes = dracoGeometry.num_attributes();
        geometryInfoStr = "Number of points loaded: " + numPoints.toString()
            + ".\n";
        geometryInfoStr += "Number of attributes loaded: " +
            numAttributes.toString() + ".\n";

        // Get position attribute. Must exists.
        const posAttId = wrapper.GetAttributeId(dracoGeometry,
            Module.POSITION);
        if (posAttId == -1) {
            const errorMsg = "No position attribute found in the mesh.";
            fileDisplayArea.innerText = errorMsg;
            DracoModule.destroy(wrapper);
            DracoModule.destroy(dracoGeometry);
            throw new Error(errorMsg);
        }
        const posAttribute = wrapper.GetAttribute(dracoGeometry, posAttId);
        const posAttributeData = new DracoModule.DracoFloat32Array();
        wrapper.GetAttributeFloatForAllPoints(
            dracoGeometry, posAttribute, posAttributeData);
        // Get color attributes if exists.
        const colorAttId = wrapper.GetAttributeId(dracoGeometry, Module.COLOR);
        let colAttributeData;
        if (colorAttId != -1) {
            geometryInfoStr += "\nLoaded color attribute.\n";
            const colAttribute = wrapper.GetAttribute(dracoGeometry, colorAttId);
            colAttributeData = new DracoModule.DracoFloat32Array();
            wrapper.GetAttributeFloatForAllPoints(dracoGeometry, colAttribute,
                colAttributeData);
        }

        // Get normal attributes if exists.
        const normalAttId =
            wrapper.GetAttributeId(dracoGeometry, Module.NORMAL);
        let norAttributeData;
        if (normalAttId != -1) {
            geometryInfoStr += "\nLoaded normal attribute.\n";
            const norAttribute = wrapper.GetAttribute(dracoGeometry, normalAttId);
            norAttributeData = new DracoModule.DracoFloat32Array();
            wrapper.GetAttributeFloatForAllPoints(dracoGeometry, norAttribute,
                norAttributeData);
        }

        // Get texture coord attributes if exists.
        const texCoordAttId =
            wrapper.GetAttributeId(dracoGeometry, Module.TEX_COORD);
        let textCoordAttributeData;
        if (texCoordAttId != -1) {
            geometryInfoStr += "\nLoaded texture coordinate attribute.\n";
            const texCoordAttribute = wrapper.GetAttribute(dracoGeometry,
                texCoordAttId);
            textCoordAttributeData = new DracoModule.DracoFloat32Array();
            wrapper.GetAttributeFloatForAllPoints(dracoGeometry,
                texCoordAttribute,
                textCoordAttributeData);
        }

        // Structure for converting to THREEJS bufferGeometry later.
        const numIndices = numFaces * 3;
        const geometryBuffer = {
            indices: new Uint32Array(numIndices),
            vertices: new Float32Array(numVertexCoordinates),
            normals: new Float32Array(numVertexCoordinates),
            uvs: new Float32Array(numTextureCoordinates),
            colors: new Float32Array(numVertexCoordinates)
        };

        for (let i = 0; i < numVertexCoordinates; i += 3) {
            geometryBuffer.vertices[i] = posAttributeData.GetValue(i);
            geometryBuffer.vertices[i + 1] = posAttributeData.GetValue(i + 1);
            geometryBuffer.vertices[i + 2] = posAttributeData.GetValue(i + 2);
            // Add color.
            if (colorAttId != -1) {
                geometryBuffer.colors[i] = colAttributeData.GetValue(i);
                geometryBuffer.colors[i + 1] = colAttributeData.GetValue(i + 1);
                geometryBuffer.colors[i + 2] = colAttributeData.GetValue(i + 2);
            } else {
                // Default is white. This is faster than TypedArray.fill().
                geometryBuffer.colors[i] = 1.0;
                geometryBuffer.colors[i + 1] = 1.0;
                geometryBuffer.colors[i + 2] = 1.0;
            }
            // Add normal.
            if (normalAttId != -1) {
                geometryBuffer.normals[i] = norAttributeData.GetValue(i);
                geometryBuffer.normals[i + 1] = norAttributeData.GetValue(i + 1);
                geometryBuffer.normals[i + 2] = norAttributeData.GetValue(i + 2);
            }
        }

        // Add texture coordinates.
        if (texCoordAttId != -1) {
            for (let i = 0; i < numTextureCoordinates; i += 2) {
                geometryBuffer.uvs[i] = textCoordAttributeData.GetValue(i);
                geometryBuffer.uvs[i + 1] = textCoordAttributeData.GetValue(i + 1);
            }
        }

        DracoModule.destroy(posAttributeData);
        if (colorAttId != -1)
            DracoModule.destroy(colAttributeData);
        if (normalAttId != -1)
            DracoModule.destroy(norAttributeData);
        if (texCoordAttId != -1)
            DracoModule.destroy(textCoordAttributeData);

        // For mesh, we need to generate the faces.
        if (geometryType == DracoModule.TRIANGULAR_MESH) {
            const ia = new DracoInt32Array();
            for (let i = 0; i < numFaces; ++i) {
                wrapper.GetFaceFromMesh(dracoGeometry, i, ia);
                const index = i * 3;
                geometryBuffer.indices[index] = ia.GetValue(0);
                geometryBuffer.indices[index + 1] = ia.GetValue(1);
                geometryBuffer.indices[index + 2] = ia.GetValue(2);
            }
            DracoModule.destroy(ia);
        }
        DracoModule.destroy(wrapper);
        DracoModule.destroy(dracoGeometry);

        fileDisplayArea.innerText += geometryInfoStr;
        fileDisplayArea.innerText += 'decode:' + (decode_end - start_time);
        fileDisplayArea.innerText +=
            ' toMsg:' + (performance.now() - decode_end);

        return {
            geometryTypeIsTriangular: geometryType == DracoModule.TRIANGULAR_MESH,
            normalAttId: normalAttId,
            texCoordAttId: texCoordAttId,
            toMsgEnd: performance.now(),

            indices: geometryBuffer.indices,
            vertices: geometryBuffer.vertices,
            colors: geometryBuffer.colors,
            normals: geometryBuffer.normals,
            uvs: geometryBuffer.uvs
        };
    }
};
