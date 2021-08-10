import { Readable } from 'stream';
import { DockerContainerHandler } from '../../lib/docker/DockerContainerHandler';
const streamifyString = require('streamify-string');

let write: any;
let streamEnd: any;
jest.mock('fs', () => ({
  createWriteStream: () => ({
    write,
    end: streamEnd,
  }),
}));

describe('DockerContainerHandler', () => {
  let container: any;
  let out: NodeJS.ReadableStream;
  let handler: DockerContainerHandler;
  let statsStream: NodeJS.ReadableStream;
  beforeEach(() => {
    container = {
      kill: jest.fn(),
      remove: jest.fn(),
      stats: async() => statsStream,
    };
    out = new Readable();
    handler = new DockerContainerHandler(container, out, 'STATSFILE');
    write = jest.fn();
    streamEnd = jest.fn();
    statsStream = streamifyString(`{"read":"2021-06-03T07:47:20.122032222Z","preread":"0001-01-01T00:00:00Z","pids_stats":{"current":1},"blkio_stats":{"io_service_bytes_recursive":[],"io_serviced_recursive":[],"io_queue_recursive":[],"io_service_time_recursive":[],"io_wait_time_recursive":[],"io_merged_recursive":[],"io_time_recursive":[],"sectors_recursive":[]},"num_procs":0,"storage_stats":{},"cpu_stats":{"cpu_usage":{"total_usage":67976781,"percpu_usage":[14524338,9727323,0,43725120],"usage_in_kernelmode":10000000,"usage_in_usermode":40000000},"system_cpu_usage":5746290000000,"online_cpus":4,"throttling_data":{"periods":7,"throttled_periods":6,"throttled_time":692628177}},"precpu_stats":{"cpu_usage":{"total_usage":0,"usage_in_kernelmode":0,"usage_in_usermode":0},"throttling_data":{"periods":0,"throttled_periods":0,"throttled_time":0}},"memory_stats":{"usage":598016,"max_usage":2723840,"stats":{"active_anon":98304,"active_file":0,"cache":0,"dirty":0,"hierarchical_memory_limit":9223372036854771712,"hierarchical_memsw_limit":9223372036854771712,"inactive_anon":0,"inactive_file":0,"mapped_file":0,"pgfault":792,"pgmajfault":0,"pgpgin":561,"pgpgout":533,"rss":0,"rss_huge":0,"total_active_anon":98304,"total_active_file":0,"total_cache":0,"total_dirty":0,"total_inactive_anon":0,"total_inactive_file":0,"total_mapped_file":0,"total_pgfault":792,"total_pgmajfault":0,"total_pgpgin":561,"total_pgpgout":533,"total_rss":0,"total_rss_huge":0,"total_unevictable":0,"total_writeback":0,"unevictable":0,"writeback":0},"limit":2087837696},"name":"/wizardly_hofstadter","id":"870aa22a1fd4b74e5a03dc67516b7ebe8e646684ae6e738b4469ee2f906e7229","networks":{"eth0":{"rx_bytes":360,"rx_packets":4,"rx_errors":0,"rx_dropped":0,"tx_bytes":0,"tx_packets":0,"tx_errors":0,"tx_dropped":0}}}
{"read":"2021-06-03T07:47:21.128130761Z","preread":"2021-06-03T07:47:20.122032222Z","pids_stats":{"current":7},"blkio_stats":{"io_service_bytes_recursive":[],"io_serviced_recursive":[],"io_queue_recursive":[],"io_service_time_recursive":[],"io_wait_time_recursive":[],"io_merged_recursive":[],"io_time_recursive":[],"sectors_recursive":[]},"num_procs":0,"storage_stats":{},"cpu_stats":{"cpu_usage":{"total_usage":155477984,"percpu_usage":[14560185,17916896,151898,122849005],"usage_in_kernelmode":30000000,"usage_in_usermode":110000000},"system_cpu_usage":5750120000000,"online_cpus":4,"throttling_data":{"periods":17,"throttled_periods":16,"throttled_time":1701663534}},"precpu_stats":{"cpu_usage":{"total_usage":67976781,"percpu_usage":[14524338,9727323,0,43725120],"usage_in_kernelmode":10000000,"usage_in_usermode":40000000},"system_cpu_usage":5746290000000,"online_cpus":4,"throttling_data":{"periods":7,"throttled_periods":6,"throttled_time":692628177}},"memory_stats":{"usage":9924608,"max_usage":9924608,"stats":{"active_anon":8708096,"active_file":0,"cache":0,"dirty":0,"hierarchical_memory_limit":9223372036854771712,"hierarchical_memsw_limit":9223372036854771712,"inactive_anon":0,"inactive_file":0,"mapped_file":0,"pgfault":3432,"pgmajfault":0,"pgpgin":2739,"pgpgout":612,"rss":8417280,"rss_huge":0,"total_active_anon":8708096,"total_active_file":0,"total_cache":0,"total_dirty":0,"total_inactive_anon":0,"total_inactive_file":0,"total_mapped_file":0,"total_pgfault":3432,"total_pgmajfault":0,"total_pgpgin":2739,"total_pgpgout":612,"total_rss":8417280,"total_rss_huge":0,"total_unevictable":0,"total_writeback":0,"unevictable":0,"writeback":0},"limit":2087837696},"name":"/wizardly_hofstadter","id":"870aa22a1fd4b74e5a03dc67516b7ebe8e646684ae6e738b4469ee2f906e7229","networks":{"eth0":{"rx_bytes":562,"rx_packets":7,"rx_errors":0,"rx_dropped":0,"tx_bytes":0,"tx_packets":0,"tx_errors":0,"tx_dropped":0}}}
{INVALID LINE...}
{"read":"2021-06-03T07:47:21.130647441Z","preread":"0001-01-01T00:00:00Z","pids_stats":{"current":12},"blkio_stats":{"io_service_bytes_recursive":[],"io_serviced_recursive":[],"io_queue_recursive":[],"io_service_time_recursive":[],"io_wait_time_recursive":[],"io_merged_recursive":[],"io_time_recursive":[],"sectors_recursive":[]},"num_procs":0,"storage_stats":{},"cpu_stats":{"cpu_usage":{"total_usage":658318598,"percpu_usage":[118444461,206215341,228361326,105297470],"usage_in_kernelmode":180000000,"usage_in_usermode":430000000},"system_cpu_usage":5750120000000,"online_cpus":4,"throttling_data":{"periods":9,"throttled_periods":6,"throttled_time":130451930}},"precpu_stats":{"cpu_usage":{"total_usage":0,"usage_in_kernelmode":0,"usage_in_usermode":0},"throttling_data":{"periods":0,"throttled_periods":0,"throttled_time":0}},"memory_stats":{"usage":52772864,"max_usage":52944896,"stats":{"active_anon":48922624,"active_file":0,"cache":0,"dirty":0,"hierarchical_memory_limit":9223372036854771712,"hierarchical_memsw_limit":9223372036854771712,"inactive_anon":0,"inactive_file":77824,"mapped_file":0,"pgfault":13893,"pgmajfault":0,"pgpgin":12870,"pgpgout":1001,"rss":48664576,"rss_huge":0,"total_active_anon":48922624,"total_active_file":0,"total_cache":0,"total_dirty":0,"total_inactive_anon":0,"total_inactive_file":77824,"total_mapped_file":0,"total_pgfault":13893,"total_pgmajfault":0,"total_pgpgin":12870,"total_pgpgout":1001,"total_rss":48664576,"total_rss_huge":0,"total_unevictable":0,"total_writeback":0,"unevictable":0,"writeback":0},"limit":2087837696},"name":"/vigorous_brahmagupta","id":"92a66f0ebfdb5bd197f5c7b21e0d97f15b687597ab325e67295b0e9c9dd24b6a","networks":{"eth0":{"rx_bytes":382,"rx_packets":5,"rx_errors":0,"rx_dropped":0,"tx_bytes":96,"tx_packets":2,"tx_errors":0,"tx_dropped":0}}}
{"read":"0001-01-01T00:00:00Z","preread":"2021-06-03T07:47:21.130647441Z","pids_stats":{},"blkio_stats":{"io_service_bytes_recursive":null,"io_serviced_recursive":null,"io_queue_recursive":null,"io_service_time_recursive":null,"io_wait_time_recursive":null,"io_merged_recursive":null,"io_time_recursive":null,"sectors_recursive":null},"num_procs":0,"storage_stats":{},"cpu_stats":{"cpu_usage":{"total_usage":0,"usage_in_kernelmode":0,"usage_in_usermode":0},"throttling_data":{"periods":0,"throttled_periods":0,"throttled_time":0}},"precpu_stats":{"cpu_usage":{"total_usage":658318598,"percpu_usage":[118444461,206215341,228361326,105297470],"usage_in_kernelmode":180000000,"usage_in_usermode":430000000},"system_cpu_usage":5750120000000,"online_cpus":4,"throttling_data":{"periods":9,"throttled_periods":6,"throttled_time":130451930}},"memory_stats":{},"name":"/vigorous_brahmagupta","id":"92a66f0ebfdb5bd197f5c7b21e0d97f15b687597ab325e67295b0e9c9dd24b6a"}
`);
  });

  describe('close', () => {
    it('kills and removes a container', async() => {
      await handler.close();
      expect(container.kill).toHaveBeenCalled();
      expect(container.remove).toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('waits until a container is finished', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      handler.join().then(onResolve, onReject);
      await new Promise(setImmediate);

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();

      out.emit('end');
      await new Promise(setImmediate);

      expect(onResolve).toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();
    });

    it('rejects if a container threw an error', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      handler.join().then(onResolve, onReject);
      await new Promise(setImmediate);

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();

      out.emit('error', new Error('DockerContainerHandler test error'));
      await new Promise(setImmediate);

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).toHaveBeenCalled();
    });

    it('returns immediately if a container is already finished', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      out.emit('end');
      await new Promise(setImmediate);

      handler.join().then(onResolve, onReject);
      await new Promise(setImmediate);

      expect(onResolve).toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();
    });

    it('rejects immediately if a container already threw', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      out.emit('error', new Error('DockerContainerHandler test error'));
      await new Promise(setImmediate);

      handler.join().then(onResolve, onReject);
      await new Promise(setImmediate);

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).toHaveBeenCalled();
    });
  });

  describe('startCollectingStats', () => {
    it('handles a valid stream', async() => {
      jest.spyOn(statsStream, 'removeAllListeners');

      const stop = await handler.startCollectingStats();
      await new Promise(resolve => statsStream.on('end', resolve));
      expect(write).toHaveBeenCalledTimes(3);
      expect(write).toHaveBeenCalledWith(`cpu_percentage,memory,memory_percentage,received,transmitted\n`);
      expect(write).toHaveBeenCalledWith(`9.13850684073107,9924608,0.4753534251735246,562,0\n`);
      expect(write).toHaveBeenCalledWith(`0,52772864,2.5276324927510077,382,96\n`);

      expect(statsStream.removeAllListeners).not.toHaveBeenCalled();
      expect(streamEnd).not.toHaveBeenCalled();
      stop();
      expect(statsStream.removeAllListeners).toHaveBeenCalled();
      expect(streamEnd).toHaveBeenCalled();
    });

    it('handles a valid stream without statsFilePath', async() => {
      handler = new DockerContainerHandler(container, out);

      jest.spyOn(statsStream, 'removeAllListeners');

      const stop = await handler.startCollectingStats();
      await new Promise(resolve => statsStream.on('end', resolve));
      expect(write).toHaveBeenCalledTimes(0);

      expect(statsStream.removeAllListeners).not.toHaveBeenCalled();
      expect(streamEnd).not.toHaveBeenCalled();
      stop();
      expect(statsStream.removeAllListeners).toHaveBeenCalled();
      expect(streamEnd).not.toHaveBeenCalled();
    });
  });
});
