import {
    ApiClient,
    ApiClientInMemoryContextProvider
} from '@northflank/js-client';

(async () => {

    const projectId = 'plylst'
    const region = 'europe-west'
    const apiToken = process.env.NF_TOKEN;

    const resources = {
        builder: 'nf-compute-200',
        web: 'nf-compute-100-1',
        migrations: 'nf-compute-100-1',
        worker: 'nf-compute-100-1',
        postgres: 'nf-compute-20',
        redis: 'nf-compute-10',
    }
    const versions = {
        branch: 'master',
        postgres: '13.4.0',
        redis: '6.2.5'
    }

    const resourceNames = {
        builder: 'builder',
        web: 'web',
        migrations: 'migrations',
        worker: 'worker',
        postgres: 'postgres',
        redis: 'redis',
    }

    const contextProvider = new ApiClientInMemoryContextProvider();
    await contextProvider.addContext({
        name: 'default',
        token: apiToken,
    });

    const apiClient = new ApiClient(contextProvider);

    await apiClient.create.project({
        data: {
            name: projectId,
            region
        },
    });

    await apiClient.create.service.build({
        parameters: {
            projectId,
        },
        data: {
            name: "builder",
            billing: {
                deploymentPlan: resources.builder
            },
            vcsData: {
                projectUrl: "https://github.com/Shpigford/plylst",
                projectType: "github"
            },
            buildSettings: {
                buildpack: {
                    builder: "HEROKU_20",
                    buildContext: "/"
                }
            }
        }
    });


    await apiClient.start.service.build({
        parameters: {
            projectId,
            serviceId: resourceNames.builder
        },
        data: {
            branch: versions.branch
        }
    });


    await apiClient.create.addon({
        parameters: {
            projectId
        },
        data: {
            name: resourceNames.postgres,
            type: "postgres",
            version: versions.postgres,
            billing: {
                deploymentPlan: resources.postgres,
                storage: 8192,
                replicas: 1
            }
        }
    });

    await apiClient.create.addon({
        parameters: {
            projectId
        },
        data: {
            name: resourceNames.redis,
            type: "redis",
            version: versions.redis,
            billing: {
                deploymentPlan: resources.redis,
                storage: 4096,
                replicas: 1
            }
        }
    });


    await apiClient.create.secret({
        parameters: {
            projectId
        },
        data: {
            name: "prod-secrets",
            description: "A description",
            secretType: "environment",
            priority: 10,
            addonDependencies: [{
                addonId: resourceNames.redis,
                keys: [{
                    keyName: "REDIS_MASTER_URL",
                    aliases: [
                        "REDIS_URL"
                    ]
                }]
            },
                {
                    addonId: resourceNames.postgres,
                    keys: [{
                        keyName: "POSTGRES_URI",
                        aliases: [
                            "DATABASE_URL"
                        ]
                    }]
                }
            ],
            data: {
                spotify_key: process.env.spotify_key,
                spotify_secret: process.env.spotify_secret
            }
        }
    });


    await apiClient.create.service.deployment({
        parameters: {
            projectId,
        },
        data: {
            name: resourceNames.web,
            billing: {
                deploymentPlan: resources.web
            },
            deployment: {
                instances: 1,
                internal: {
                    id: resourceNames.builder,
                    branch: versions.branch,
                    buildSHA: "latest"
                }
            },
            ports: [{
                name: "web",
                internalPort: 8080,
                public: true,
                protocol: "HTTP"
            }]
        }
    });


    await apiClient.create.service.deployment({
        parameters: {
            projectId,
        },
        data: {
            name: resourceNames.worker,
            billing: {
                deploymentPlan: resources.worker
            },
            deployment: {
                instances: 1,
                internal: {
                    id: resourceNames.builder,
                    branch: versions.branch,
                    buildSHA: "latest"
                }
            }
        }
    });


    await apiClient.create.job.manual({
        parameters: {
            projectId
        },
        data: {
            name: resourceNames.migrations,
            billing: {
                deploymentPlan: resources.migrations
            },
            backoffLimit: 0,
            activeDeadlineSeconds: 600,
            deployment: {
                instances: 1,
                internal: {
                    id: resourceNames.builder,
                    branch: versions.branch,
                    buildSHA: "latest"
                }
            }
        }
    });


    await apiClient.update.job.cmdOverride({
        parameters: {
            projectId,
            jobId: resourceNames.migrations
        },
        data: {
            cmd: "rake --trace db:migrate"
        }
    });

    await apiClient.update.service.cmdOverride({
        parameters: {
            projectId,
            serviceId: resourceNames.worker
        },
        data: {
            cmd: "bundle exec sidekiq -e ${RAILS_ENV:-production} -C config/sidekiq.yml"
        }
    });


    await apiClient.start.job.run({
        parameters: {
            projectId,
            jobId: resourceNames.migrations
        }
    });


})();