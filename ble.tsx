import {
  Button,
  Dimensions,
  FlatList,
  Image,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';
import BleManager, {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
  Peripheral,
} from 'react-native-ble-manager';
import React, {useEffect, useRef, useState} from 'react';
import {Colors} from 'react-native/Libraries/NewAppScreen';
import {Buffer} from 'buffer';

const SECONDS_TO_SCAN_FOR = 3;
const SERVICE_UUIDS: string[] = [];
const ALLOW_DUPLICATES = true;
const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
declare module 'react-native-ble-manager' {
  // enrich local contract with custom state properties needed by App.tsx
  interface Peripheral {
    connected?: boolean;
    connecting?: boolean;
  }
}
const width = Dimensions.get('window').width;
const height = Dimensions.get('window').height;
export default function BLEComponent() {
  const [isScanning, setIsScanning] = useState(false);
  const [peripherals, setPeripherals] = useState(
    new Map<Peripheral['id'], Peripheral>(),
  );
  const [connectedInfo, setConnectInfo] = useState<{
    deviceId: string;
    notifyServiceId: string;
    notifyId: string;
    notifyDescriptorId: string;
    writeId: string;
    writeServiceId: string;
    writeDescriptorId: string;
  }>({
    deviceId: '',
    notifyServiceId: '',
    notifyId: '',
    notifyDescriptorId: '',
    writeServiceId: '',
    writeId: '',
    writeDescriptorId: '',
  });
  const startScan = () => {
    if (!isScanning) {
      // reset found peripherals before scan
      setPeripherals(new Map<Peripheral['id'], Peripheral>());

      try {
        console.debug('[startScan] starting scan...');
        setIsScanning(true);
        BleManager.scan(SERVICE_UUIDS, SECONDS_TO_SCAN_FOR, ALLOW_DUPLICATES)
          .then(() => {
            console.debug('[startScan] scan promise returned successfully.');
          })
          .catch((err: any) => {
            console.error('[startScan] ble scan returned in error', err);
          });
      } catch (error) {
        console.error('[startScan] ble scan error thrown', error);
      }
    }
  };

  const enableBluetooth = async () => {
    try {
      console.debug('[enableBluetooth]');
      await BleManager.enableBluetooth();
    } catch (error) {
      console.error('[enableBluetooth] thrown', error);
    }
  };

  const handleStopScan = () => {
    setIsScanning(false);
    console.debug('[handleStopScan] scan is stopped.');
  };

  const handleDisconnectedPeripheral = (
    event: BleDisconnectPeripheralEvent,
  ) => {
    console.debug(
      `[handleDisconnectedPeripheral][${event.peripheral}] disconnected.`,
    );
    setPeripherals(map => {
      let p = map.get(event.peripheral);
      if (p) {
        p.connected = false;
        return new Map(map.set(event.peripheral, p));
      }
      return map;
    });
  };

  const handleConnectPeripheral = (event: any) => {
    console.log(`[handleConnectPeripheral][${event.peripheral}] connected.`);
  };
  const imageDataRef = useRef<number[]>([]);
  const imageInfoRef = useRef<{
    currSize: number;
    type: number;
    width: number;
    height: number;
    size: number;
  }>();
  const [base64, setBase64] = useState('');
  const isFirst = useRef(true);
  const handleUpdateValueForCharacteristic = (
    data: BleManagerDidUpdateValueForCharacteristicEvent,
  ) => {
    // console.debug(
    //   `[handleUpdateValueForCharacteristic] received data from '${data.peripheral}' with characteristic='${data.characteristic}' and value='${data.value}'`,
    // );
    if (data.value) {
      const value = new Uint8Array(data.value);
      if (isFirst.current && value.length === 10) {
        console.log('接收到了第一帧');
        imageDataRef.current = [];
        isFirst.current = false;
        console.log(value);
        //前两位是图片类型 4为jpeg
        //接着两位是图片宽度
        //接着两位是图片高度
        //接着四位是图片大小
        let type = value[0];
        let width = value[1] * 256 + value[2];
        let height = value[3] * 256 + value[4];
        let size =
          value[5] * 256 * 256 * 256 +
          value[6] * 256 * 256 +
          value[7] * 256 +
          value[8];
        console.log('type', type);
        console.log('width', width);
        console.log('height', height);
        console.log('size', size);
        imageInfoRef.current = {
          type,
          width,
          height,
          size,
          currSize: 0,
        };
        return;
      }
      if (imageInfoRef.current) {
        console.log('接收到了图片数据');
        imageDataRef.current = imageDataRef.current.concat(Array.from(value));
        imageInfoRef.current.currSize += value.length;
        if (imageInfoRef.current.currSize >= imageInfoRef.current.size) {
          console.log('接收到了一张图片');
          //将图片数据转成base64
          const arrayBuffer = Buffer.from(
            new Uint8Array(imageDataRef.current),
          ).toString('base64');
          const b64 = 'data:image/jpeg;base64,' + arrayBuffer;
          setBase64(b64);
          console.log(b64);
          isFirst.current = true;
        }
      }

      //   console.log('value', value);
      //   imageDataRef.current = imageDataRef.current.concat(Array.from(value));
      //   console.log('imageDataRef', imageDataRef.current);
    }
  };

  const handleDiscoverPeripheral = (peripheral: Peripheral) => {
    console.log('发现了外围设备', peripheral.name);
    console.debug('[handleDiscoverPeripheral] new BLE peripheral=', peripheral);
    if (!peripheral.name) {
      peripheral.name = 'NO NAME';
    }

    setPeripherals(map => {
      return new Map(map.set(peripheral.id, peripheral));
    });
    if (peripheral.name.startsWith('ESP')) {
      console.log('发现了ESP设备', peripheral.name);
    }
  };

  const togglePeripheralConnection = async (peripheral: Peripheral) => {
    if (peripheral && peripheral.connected) {
      try {
        await BleManager.disconnect(peripheral.id);
      } catch (error) {
        console.error(
          `[togglePeripheralConnection][${peripheral.id}] error when trying to disconnect device.`,
          error,
        );
      }
    } else {
      await connectPeripheral(peripheral);
    }
  };

  const retrieveConnected = async () => {
    try {
      const connectedPeripherals = await BleManager.getConnectedPeripherals();
      if (connectedPeripherals.length === 0) {
        console.warn('[retrieveConnected] No connected peripherals found.');
        return;
      }

      console.debug(
        '[retrieveConnected] connectedPeripherals',
        connectedPeripherals,
      );

      for (let peripheral of connectedPeripherals) {
        setPeripherals(map => {
          let p = map.get(peripheral.id);
          if (p) {
            p.connected = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });
      }
    } catch (error) {
      console.error(
        '[retrieveConnected] unable to retrieve connected peripherals.',
        error,
      );
    }
  };

  const getAssociatedPeripherals = async () => {
    try {
      const associatedPeripherals = await BleManager.getAssociatedPeripherals();
      console.debug(
        '[getAssociatedPeripherals] associatedPeripherals',
        associatedPeripherals,
      );

      for (let peripheral of associatedPeripherals) {
        setPeripherals(map => {
          return new Map(map.set(peripheral.id, peripheral));
        });
      }
    } catch (error) {
      console.error(
        '[getAssociatedPeripherals] unable to retrieve associated peripherals.',
        error,
      );
    }
  };

  const connectPeripheral = async (peripheral: Peripheral) => {
    try {
      if (peripheral) {
        setPeripherals(map => {
          let p = map.get(peripheral.id);
          if (p) {
            p.connecting = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        await BleManager.connect(peripheral.id);
        console.debug(`[connectPeripheral][${peripheral.id}] connected.`);

        setPeripherals(map => {
          let p = map.get(peripheral.id);
          if (p) {
            p.connecting = false;
            p.connected = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        // before retrieving services, it is often a good idea to let bonding & connection finish properly
        await sleep(900);

        /* Test read current RSSI value, retrieve services first */
        const peripheralData = await BleManager.retrieveServices(peripheral.id);
        console.debug(
          `[connectPeripheral][${peripheral.id}] retrieved peripheral services`,
          peripheralData,
        );

        setPeripherals(map => {
          let p = map.get(peripheral.id);
          if (p) {
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        const rssi = await BleManager.readRSSI(peripheral.id);
        console.debug(
          `[connectPeripheral][${peripheral.id}] retrieved current RSSI value: ${rssi}.`,
        );

        if (peripheralData.characteristics) {
          for (let characteristic of peripheralData.characteristics) {
            if (characteristic.descriptors) {
              for (let descriptor of characteristic.descriptors) {
                try {
                  if (characteristic.characteristic.includes('ff01')) {
                    setConnectInfo({
                      deviceId: peripheral.id,
                      notifyServiceId: characteristic.service,
                      notifyId: characteristic.characteristic,
                      notifyDescriptorId: descriptor.uuid,
                      writeServiceId: characteristic.service,
                      writeId: characteristic.characteristic,
                      writeDescriptorId: descriptor.uuid,
                    });
                    console.log('deviceId', peripheral.id);
                    console.log('notifyServiceId', characteristic.service);
                    console.log('notifyId', characteristic.characteristic);
                    console.log('notifyDescriptorId', descriptor.uuid);
                  }
                } catch (error) {
                  console.error(
                    `[connectPeripheral][${peripheral.id}] failed to retrieve descriptor ${descriptor} for characteristic ${characteristic}:`,
                    error,
                  );
                }
              }
            }
          }
        }

        setPeripherals(map => {
          let p = map.get(peripheral.id);
          if (p) {
            p.rssi = rssi;
            return new Map(map.set(p.id, p));
          }
          return map;
        });
        //todo: navigate to peripheral details
        // navigation.navigate('PeripheralDetails', {
        //   peripheralData: peripheralData,
        // });
      }
    } catch (error) {
      console.error(
        `[connectPeripheral][${peripheral.id}] connectPeripheral error`,
        error,
      );
    }
  };
  function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }
  useEffect(() => {
    try {
      BleManager.start({showAlert: false})
        .then(() => console.debug('BleManager started.'))
        .catch((error: any) =>
          console.error('BeManager could not be started.', error),
        );
    } catch (error) {
      console.error('unexpected error starting BleManager.', error);
      return;
    }

    const listeners = [
      bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscoverPeripheral,
      ),
      bleManagerEmitter.addListener('BleManagerStopScan', handleStopScan),
      bleManagerEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        handleDisconnectedPeripheral,
      ),
      bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        handleUpdateValueForCharacteristic,
      ),
      bleManagerEmitter.addListener(
        'BleManagerConnectPeripheral',
        handleConnectPeripheral,
      ),
    ];

    handleAndroidPermissions();

    return () => {
      console.debug('[app] main component unmounting. Removing listeners...');
      for (const listener of listeners) {
        listener.remove();
      }
    };
  }, []);

  const handleAndroidPermissions = () => {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]).then(result => {
        if (result) {
          console.debug(
            '[handleAndroidPermissions] User accepts runtime permissions android 12+',
          );
        } else {
          console.error(
            '[handleAndroidPermissions] User refuses runtime permissions android 12+',
          );
        }
      });
    } else if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ).then(checkResult => {
        if (checkResult) {
          console.debug(
            '[handleAndroidPermissions] runtime permission Android <12 already OK',
          );
        } else {
          PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ).then(requestResult => {
            if (requestResult) {
              console.debug(
                '[handleAndroidPermissions] User accepts runtime permission android <12',
              );
            } else {
              console.error(
                '[handleAndroidPermissions] User refuses runtime permission android <12',
              );
            }
          });
        }
      });
    }
  };
  const renderItem = ({item}: {item: Peripheral}) => {
    const backgroundColor = item.connected ? '#069400' : Colors.white;
    return (
      <TouchableHighlight
        underlayColor="#0082FC"
        onPress={() => togglePeripheralConnection(item)}>
        <View style={[styles.row, {backgroundColor}]}>
          <Text style={styles.peripheralName}>
            {/* completeLocalName (item.name) & shortAdvertisingName (advertising.localName) may not always be the same */}
            {item.name} - {item?.advertising?.localName}
            {item.connecting && ' - Connecting...'}
          </Text>
          <Text style={styles.rssi}>RSSI: {item.rssi}</Text>
          <Text style={styles.peripheralId}>{item.id}</Text>
        </View>
      </TouchableHighlight>
    );
  };
  return (
    <ScrollView nestedScrollEnabled={true}>
      <Button title="连接蓝牙" onPress={startScan} />
      <Text>{isScanning ? 'Scanning...' : 'Scan Bluetooth Devices'}</Text>

      <FlatList
        style={{height: 300}}
        data={Array.from(peripherals.values())}
        contentContainerStyle={{rowGap: 12}}
        renderItem={renderItem}
        keyExtractor={item => item.id}
      />
      <View style={{height: 100}}>
        <Text>deviceId: {JSON.stringify(connectedInfo)}</Text>
      </View>
      <Button
        title="发送拍照请求"
        onPress={async () => {
          if (!connectedInfo.deviceId) {
            console.log('没有连接设备');
            return;
          }
          try {
            let res = await BleManager.requestMTU(connectedInfo.deviceId, 512);
            console.log(res);
            await BleManager.writeWithoutResponse(
              connectedInfo.deviceId,
              connectedInfo.writeServiceId,
              connectedInfo.writeId,
              [0x55, 0xaa],
            );

            await BleManager.startNotification(
              connectedInfo.deviceId,
              connectedInfo.notifyServiceId,
              connectedInfo.notifyId,
            );
          } catch (e) {
            console.log(e);
          }
        }}
      />
      {base64 ? (
        <View>
          <Text>接收到了图片</Text>
          <Image
            source={{
              uri: base64,
            }}
            width={width}
            height={width}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
const boxShadow = {
  shadowColor: '#000',
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.25,
  shadowRadius: 3.84,
  elevation: 5,
};
const styles = StyleSheet.create({
  engine: {
    position: 'absolute',
    right: 10,
    bottom: 0,
    color: Colors.black,
  },
  buttonGroup: {
    flexDirection: 'row',
    width: '100%',
  },
  scanButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0a398a',
    margin: 10,
    borderRadius: 12,
    flex: 1,
    ...boxShadow,
  },
  scanButtonText: {
    fontSize: 16,
    letterSpacing: 0.25,
    color: Colors.white,
  },
  body: {
    backgroundColor: '#0082FC',
    flex: 1,
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.black,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: Colors.dark,
  },
  highlight: {
    fontWeight: '700',
  },
  footer: {
    color: Colors.dark,
    fontSize: 12,
    fontWeight: '600',
    padding: 4,
    paddingRight: 12,
    textAlign: 'right',
  },
  peripheralName: {
    fontSize: 16,
    textAlign: 'center',
    padding: 10,
  },
  rssi: {
    fontSize: 12,
    textAlign: 'center',
    padding: 2,
  },
  peripheralId: {
    fontSize: 12,
    textAlign: 'center',
    padding: 2,
    paddingBottom: 20,
  },
  row: {
    marginLeft: 10,
    marginRight: 10,
    borderRadius: 20,
    ...boxShadow,
  },
  noPeripherals: {
    margin: 10,
    textAlign: 'center',
    color: Colors.white,
  },
});
