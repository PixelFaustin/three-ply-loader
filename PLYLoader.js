/**
 * @author Austin McKenna / `${mckenna}m${austin}@${gmail}.com`
 *
 * Description: A THREE loader for ASCII PLY mesh files.
 *
 * Usage:
 *  var loader = new THREE.PLYLoader();
 *  loader.load(url, function onLoad(geometry) {}, function onProgress(percent) {}, function onError(err) {});
 *
 * See threejs.org/license
 */

THREE.PLYLoader = (function() {
  var DataType = {
    FLOAT: 0,
    DOUBLE: 1,
    UCHAR: 2,
    CHAR: 3,
    SHORT: 4,
    USHORT: 5,
    INT: 6,
    UINT: 7
  };

  var Mesh = {
    positions: [],
    normals: [],
    texcoords: [],
    colors: [],
    indices: []
  };

  Object.freeze(DataType);

  function isDataTypeInteger(dataType) {
    var result = false;
    switch (dataType) {
      case DataType.CHAR:
      case DataType.UCHAR:
      case DataType.SHORT:
      case DataType.USHORT:
      case DataType.INT:
      case DataType.UINT:
        result = true;
        break;
      default:
        result = false;
    }

    return result;
  }

  //http://paulbourke.net/dataformats/ply/
  function getSizeofDataType(dataType) {
    var size = 0;

    switch (dataType) {
      case DataType.CHAR:
      case DataType.UCHAR:
        size = 1;
        break;
      case DataType.SHORT:
      case DataType.USHORT:
        size = 2;
        break;
      case DataType.INT:
      case DataType.UINT:
      case DataType.FLOAT:
        size = 4;
        break;
      case DataType.DOUBLE:
        size = 8;
        break;
    }

    return size;
  }

  function parseDataType(input) {
    var typeStr = input;
    //Some .ply datatypes append their sizes
    var numberMatcher = /\d/;
    if (numberMatcher.test(typeStr)) {
      typeStr = typeStr
        .split('')
        .filter(function(char) {
          return isNaN(char);
        })
        .join('');
    }

    switch (typeStr.toLowerCase()) {
      case 'float':
        return DataType.FLOAT;
      case 'double':
        return DataType.DOUBLE;
      case 'uchar':
        return DataType.UCHAR;
      case 'char':
        return DataType.CHAR;
      case 'short':
        return DataType.SHORT;
      case 'ushort':
        return DataType.USHORT;
      case 'int':
        return DataType.INT;
      case 'uint':
        return DataType.UINT;
      default:
        throw new Error('Unknown datatype parsed!');
    }
  }

  function parseASCIINumber(ascii, type, base) {
    switch (type) {
      case DataType.CHAR:
      case DataType.UCHAR:
      case DataType.SHORT:
      case DataType.USHORT:
      case DataType.INT:
      case DataType.UINT:
        return parseInt(ascii, base);
      case DataType.FLOAT:
      case DataType.DOUBLE:
        return parseFloat(ascii);
    }
  }

  function parseBinaryNumber(dataView, offset, type, isLittleEndian) {
    switch (type) {
      case DataType.CHAR:
        return dataView.getInt8(offset, isLittleEndian);
      case DataType.UCHAR:
        return dataView.getUint8(offset, isLittleEndian);
      case DataType.SHORT:
        return dataView.getInt16(offset, isLittleEndian);
      case DataType.USHORT:
        return dataView.getUint16(offset, isLittleEndian);
      case DataType.INT:
        return dataView.getInt32(offset, isLittleEndian);
      case DataType.UINT:
        return dataView.getUint32(offset, isLittleEndian);
      case DataType.FLOAT:
        return dataView.getFloat32(offset, isLittleEndian);
      case DataType.DOUBLE:
        return dataView.getFloat64(offset, isLittleEndian);
    }
  }

  var rawConverter = function(type, isASCII, format, normalizeIntegers) {
    return function(raw) {
      if (isASCII) {
        var converted = parseASCIINumber(raw, type, 10);

        if (normalizeIntegers && isDataTypeInteger(type)) {
          var domain = Math.pow(2, getSizeofDataType(type) * 8);
          converted /= domain;
        }
        return converted;
      } else {
        var dataView = raw.dataView;
        var offset = raw.offset;
        return parseBinaryNumber(
          dataView,
          offset,
          type,
          format.toLowerCase().includes('little')
        );
      }
    };
  };

  var positionSetter = function(converter) {
    return function(value, positions, normals, texcoords, colors) {
      positions.push(converter(value));
    };
  };

  var normalSetter = function(converter) {
    return function(value, positions, normals, texcoords, colors) {
      normals.push(converter(value));
    };
  };

  var texcoordSetter = function(converter) {
    return function(value, positions, normals, texcoords, colors) {
      texcoords.push(converter(value));
    };
  };

  var colorSetter = function(converter) {
    return function(value, positions, normals, texcoords, colors) {
      colors.push(converter(value));
    };
  };

  function PLYLoader() {}

  PLYLoader.prototype = {
    constructor: PLYLoader,
    load: function(url, onLoad, onProgress, onError) {
      var scope = this;
      var fileLoader = new THREE.FileLoader();
      fileLoader.load(
        url,
        function(data) {
          if (onError === null || onError === undefined) {
            var mesh = scope.parse(data);
            onLoad(scope.process(mesh));
          } else {
            try {
              var mesh = scope.parse(data);
              onLoad(scope.process(mesh));
            } catch (err) {
              onError(err);
            }
          }
        },
        function(xhr) {
          if (onProgress !== null && onProgress !== undefined) {
            onProgress(xhr);
          }
        },
        function(err) {
          var errMsg = 'File not found';
          if (onError === null || onError === undefined) {
            throw new Error(errMsg);
          } else {
            onError(errMsg);
          }
        }
      );
    },
    parseFormat: function(data) {},
    isMagic: function(data) {
      return data.startsWith('ply');
    },
    parseHeader: function(data) {
      var header = {
        isASCII: false,
        format: '',
        isLittleEndian: false,
        version: '',
        comments: [],
        vertexCount: 0,
        faceCount: 0,
        elementLUT: [],
        indexCountAccessor: undefined,
        indexAccessor: undefined,
        endHeaderIndex: 0
      };

      var lines = data.split('\n');
      var endHeaderIdx = lines.indexOf('end_header');

      if (endHeaderIdx < 0) {
        throw new Error('Malformed ply header!');
      }

      header.endHeaderIndex = endHeaderIdx;
      var headerLines = lines.slice(0, endHeaderIdx);

      var properties = [];
      var facePropertyStartIdx = 0;
      var vertexPropertyStartIdx = 0;
      var avoidPropertyStartIdx = Infinity;

      headerLines.forEach(function(line, i) {
        var data = line.trim().split(/\s+/);
        var type = data.shift();
        switch (type) {
          case 'format':
            header.format = data[0];
            header.version = data[1];
            break;
          case 'comment':
            header.comments.push(data.join(' '));
            break;
          case 'element':
            var elementType = data[0];
            var elementValue = data[1];

            if (elementType === 'vertex') {
              header.vertexCount = parseInt(elementValue);
              vertexPropertyStartIdx = Math.max(vertexPropertyStartIdx, i);
            } else if (elementType === 'face') {
              header.faceCount = parseInt(elementValue);
              facePropertyStartIdx = Math.max(facePropertyStartIdx, i);
            } else {
              avoidPropertyStartIdx = Math.min(avoidPropertyStartIdx, i);
            }
            break;
          case 'property':
            properties.push({ index: i, data: data });
            break;
        }
      });

      header.isASCII = header.format.toUpperCase() === 'ASCII';
      header.isLittleEndian = header.format.toUpperCase().includes('LITTLE');

      properties.forEach(function(property) {
        var index = property.index;
        var data = property.data;

        if (index > vertexPropertyStartIdx && index < facePropertyStartIdx) {
          var dataType = data[0];
          var attrType = data[1];

          switch (attrType) {
            case 'x':
            case 'y':
            case 'z':
              header.elementLUT.push(
                positionSetter(
                  rawConverter(
                    parseDataType(dataType),
                    header.isASCII,
                    header.format,
                    false
                  )
                )
              );
              break;
            case 'nx':
            case 'ny':
            case 'nz':
              header.elementLUT.push(
                normalSetter(
                  rawConverter(
                    parseDataType(dataType),
                    header.isASCII,
                    header.format,
                    false
                  )
                )
              );
              break;
            case 's':
            case 't':
              header.elementLUT.push(
                texcoordSetter(
                  rawConverter(
                    parseDataType(dataType),
                    header.isASCII,
                    header.format,
                    false
                  )
                )
              );
              break;
            case 'red':
            case 'green':
            case 'blue':
              header.elementLUT.push(
                colorSetter(
                  rawConverter(
                    parseDataType(dataType),
                    header.isASCII,
                    header.format,
                    true
                  )
                )
              );
              break;
          }
        } else if (
          index > vertexPropertyStartIdx &&
          index > facePropertyStartIdx &&
          index < avoidPropertyStartIdx
        ) {
          var indexCountDataType = data[1];
          var indexDataType = data[2];

          header.indexCountAccessor = rawConverter(
            parseDataType(indexCountDataType),
            header.isASCII,
            header.format
          );
          header.indexAccessor = rawConverter(
            parseDataType(indexDataType),
            header.isASCII,
            header.format
          );
        }
      });

      return header;
    },
    parseBinaryBody: function(data, header) {
      throw new Error('Binary parsing is not supported.');
    },
    parseASCIIBody: function(data, header) {
      var mesh = Object.assign({}, Mesh);
      var endIndex = header.endHeaderIndex;
      var lines = data.split('\n').slice(endIndex + 1);

      var elements = lines.slice(0, header.vertexCount);
      var faces = lines.slice(header.vertexCount).filter(function(line) {
        return line !== '';
      });

      if (
        elements.length + faces.length !==
        header.vertexCount + header.faceCount
      ) {
        throw new Error(
          'Malformed vertex/index list, try re-exporting the .ply file.'
        );
      }

      elements.forEach(function(elementLine) {
        if (elementLine !== '') {
          var elementArr = elementLine.trim().split(/\s+/);
          elementArr.forEach(function(element, index) {
            header.elementLUT[index](
              element,
              mesh.positions,
              mesh.normals,
              mesh.texcoords,
              mesh.colors
            );
          });
        }
      });

      faces.forEach(function(faceLine) {
        if (faceLine !== '') {
          var faceArr = faceLine.trim().split(/\s+/);
          var expectedIndicesCount = header.indexCountAccessor(faceArr.shift());

          if (faceArr.length !== expectedIndicesCount) {
            throw new Error(
              'Malformed face format! Expected ' +
                expectedIndicesCount +
                ' but got ' +
                faceArr.length +
                '.'
            );
          }

          faceArr.forEach(function(face) {
            mesh.indices.push(header.indexAccessor(face));
          });
        }
      });

      return mesh;
    },
    parse: function(data) {
      if (!this.isMagic(data)) {
        throw new Error(
          'Cannot parse a .ply model from a non-ply file format!'
        );
      }

      var header = this.parseHeader(data);

      var mesh = undefined;

      if (header.isASCII) {
        mesh = this.parseASCIIBody(data, header);
      } else {
        mesh = this.parseBinaryBody(data, header);
      }

      return mesh;
    },
    process: function(mesh) {
      if (mesh.positions.length * mesh.indices.length === 0) {
        throw new Error('Cannot load an empty .ply mesh.');
      }

      console.log(mesh);

      var geometry = new THREE.BufferGeometry();

      geometry.setIndex(mesh.indices);
      geometry.addAttribute(
        'position',
        new THREE.Float32BufferAttribute(mesh.positions, 3)
      );

      if (mesh.normals.length > 0) {
        geometry.addAttribute(
          'normal',
          new THREE.Float32BufferAttribute(mesh.normals, 3)
        );
      } else {
        geometry.computeVertexNormals();
      }

      if (mesh.texcoords.length > 0) {
        geometry.addAttribute(
          'uv',
          new THREE.Float32BufferAttribute(mesh.texcoords, 2)
        );
      }

      if (mesh.colors.length > 0) {
        geometry.addAttribute(
          'color',
          new THREE.Float32BufferAttribute(mesh.colors, 3)
        );
      }

      return geometry;
    }
  };

  return PLYLoader;
})();
