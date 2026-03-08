import { ShellExecutor } from '../utils/shellExecutor.js';

export class DockerManager {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.shell = new ShellExecutor({ cwd: this.projectPath });
  }

  async isDockerAvailable() {
    const result = await this.shell.exec('docker --version');
    return result.success;
  }

  async build(imageName, tag = 'latest', options = {}) {
    const buildArgs = options.buildArgs || [];
    const args = buildArgs.map(arg => `--build-arg ${arg}`).join(' ');
    const noCache = options.noCache ? '--no-cache' : '';
    const command = `docker build ${noCache} -t ${imageName}:${tag} ${args} .`;
    
    return await this.shell.exec(command);
  }

  async run(imageName, tag = 'latest', options = {}) {
    const port = options.port ? `-p ${options.port}` : '';
    const env = (options.env || []).map(e => `-e ${e}`).join(' ');
    const volume = (options.volumes || []).map(v => `-v ${v}`).join(' ');
    const detached = options.detached ? '-d' : '';
    const name = options.name ? `--name ${options.name}` : '';
    const command = `docker run ${detached} ${port} ${env} ${volume} ${name} ${imageName}:${tag}`;
    
    return await this.shell.exec(command);
  }

  async start(containerName) {
    return await this.shell.exec(`docker start ${containerName}`);
  }

  async stop(containerName) {
    return await this.shell.exec(`docker stop ${containerName}`);
  }

  async restart(containerName) {
    return await this.shell.exec(`docker restart ${containerName}`);
  }

  async ps(all = false) {
    const flags = all ? '-a' : '';
    return await this.shell.exec(`docker ps ${flags}`);
  }

  async logs(containerName, tail = 100) {
    return await this.shell.exec(`docker logs ${containerName} --tail ${tail}`);
  }

  async exec(containerName, command) {
    return await this.shell.exec(`docker exec ${containerName} ${command}`);
  }

  async psql(containerName, database, user = 'postgres') {
    return await this.shell.exec(`docker exec -it ${containerName} psql -U ${user} -d ${database}`);
  }

  async mysql(containerName, database, user = 'root') {
    return await this.shell.exec(`docker exec -it ${containerName} mysql -u ${user} -p ${database}`);
  }

  async mongo(containerName, database) {
    return await this.shell.exec(`docker exec -it ${containerName} mongosh ${database}`);
  }

  async redisCli(containerName) {
    return await this.shell.exec(`docker exec -it ${containerName} redis-cli`);
  }

  async sh(containerName) {
    return await this.shell.exec(`docker exec -it ${containerName} sh`);
  }

  async bash(containerName) {
    return await this.shell.exec(`docker exec -it ${containerName} bash`);
  }

  async rm(containerName, force = false) {
    const flags = force ? '-f' : '';
    return await this.shell.exec(`docker rm ${flags} ${containerName}`);
  }

  async rmi(imageName, force = false) {
    const flags = force ? '-f' : '';
    return await this.shell.exec(`docker rmi ${flags} ${imageName}`);
  }

  async pull(imageName) {
    return await this.shell.exec(`docker pull ${imageName}`);
  }

  async push(imageName) {
    return await this.shell.exec(`docker push ${imageName}`);
  }

  async images() {
    return await this.shell.exec('docker images');
  }

  async inspect(containerName) {
    return await this.shell.exec(`docker inspect ${containerName}`);
  }

  async stats(containerName, stream = false) {
    const noStream = stream ? '' : '--no-stream';
    return await this.shell.exec(`docker stats ${containerName} ${noStream}`);
  }

  async top(containerName) {
    return await this.shell.exec(`docker top ${containerName}`);
  }

  async networkLs() {
    return await this.shell.exec('docker network ls');
  }

  async volumeLs() {
    return await this.shell.exec('docker volume ls');
  }

  async composeUp(services = '', detached = true) {
    const flags = detached ? '-d' : '';
    return await this.shell.exec(`docker-compose up ${flags} ${services}`);
  }

  async composeDown(removeVolumes = false) {
    const flags = removeVolumes ? '-v' : '';
    return await this.shell.exec(`docker-compose down ${flags}`);
  }

  async composeBuild(noCache = false) {
    const flags = noCache ? '--no-cache' : '';
    return await this.shell.exec(`docker-compose build ${flags}`);
  }

  async composeLogs(services = '', tail = 100) {
    return await this.shell.exec(`docker-compose logs --tail ${tail} ${services}`);
  }

  async composePs() {
    return await this.shell.exec('docker-compose ps');
  }

  async composeRun(service, command) {
    return await this.shell.exec(`docker-compose run ${service} ${command}`);
  }

  async composeExec(service, command) {
    return await this.shell.exec(`docker-compose exec ${service} ${command}`);
  }

  async getContainerInfo() {
    const ps = await this.ps(true);
    const images = await this.images();
    const networks = await this.networkLs();
    const volumes = await this.volumeLs();

    return {
      containers: ps.stdout,
      images: images.stdout,
      networks: networks.stdout,
      volumes: volumes.stdout
    };
  }

  async prune() {
    const containers = await this.shell.exec('docker container prune -f');
    const images = await this.shell.exec('docker image prune -f');
    const volumes = await this.shell.exec('docker volume prune -f');
    const networks = await this.shell.exec('docker network prune -f');

    return {
      containers: containers.stdout,
      images: images.stdout,
      volumes: volumes.stdout,
      networks: networks.stdout
    };
  }
}

export default DockerManager;
