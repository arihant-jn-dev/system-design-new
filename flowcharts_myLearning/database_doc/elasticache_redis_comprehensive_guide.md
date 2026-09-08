# ElastiCache Redis Comprehensive Guide

## Table of Contents
1. [Core Terminology](#core-terminology)
2. [Redis Architecture Overview](#redis-architecture-overview)
3. [Cluster vs Non-Cluster Mode](#cluster-vs-non-cluster-mode)
4. [Replication and High Availability](#replication-and-high-availability)
5. [Scaling Strategies](#scaling-strategies)
6. [Handling Heavy Traffic](#handling-heavy-traffic)
7. [Real-World Examples](#real-world-examples)

---

## Core Terminology

### **Primary Node (Master)**
- The main Redis node that handles all write operations
- Processes read operations when no replicas are available
- Maintains the authoritative copy of data
- Can have multiple replica nodes attached to it

### **Replica Node (Slave/Secondary)**
- Read-only copy of the primary node
- Receives data updates asynchronously from the primary
- Used to scale read operations and provide redundancy
- Can be promoted to primary if the original primary fails

### **Redis Cluster**
- A distributed setup with multiple primary nodes
- Data is automatically partitioned (sharded) across nodes
- Each primary can have its own replica nodes
- Provides horizontal scaling and high availability

### **Shard (Hash Slot)**
- A subset of data distributed across cluster nodes
- Redis Cluster uses 16,384 hash slots
- Each primary node is responsible for a range of hash slots
- Keys are mapped to hash slots using CRC16 algorithm

### **Replication Group**
- A collection of one primary and zero or more replica nodes
- All nodes in the group contain the same data
- Provides read scaling and automatic failover capability

### **Node Group**
- In cluster mode, a node group contains one primary and its replicas
- Equivalent to a replication group in cluster context
- Each node group handles a specific range of hash slots

### **Endpoint**
- Connection string used to access Redis nodes
- **Primary Endpoint**: Write operations endpoint
- **Reader Endpoint**: Read operations endpoint (load balanced across replicas)
- **Configuration Endpoint**: Cluster mode discovery endpoint

### **Failover**
- Process of promoting a replica to primary when the original primary fails
- Can be automatic (AWS handles it) or manual
- Minimizes downtime and data loss

---

## Redis Architecture Overview

### Single Node Architecture

```mermaid
graph TD
    A[Applications] --> B[Redis Primary<br/>Read + Write<br/>Data Storage]
    
    style A fill:#e1f5fe
    style B fill:#ffecb3
```

**Characteristics:**
- ✓ Simple setup
- ✓ Low latency
- ✗ Single point of failure
- ✗ Limited by single node capacity

### Primary-Replica Architecture

```mermaid
graph TD
    A[Applications] --> B[Write Traffic]
    A --> C[Read Traffic]
    
    B --> D[Redis Primary<br/>Write/Read]
    C --> E[Redis Replica<br/>Read Only]
    
    D -.->|Async Replication| E
    
    style A fill:#e1f5fe
    style D fill:#ffecb3
    style E fill:#e8f5e8
```

**Benefits:**
- ✓ Read scaling
- ✓ High availability
- ✓ Automatic failover
- ✗ Write operations still limited to primary

---

## Cluster vs Non-Cluster Mode

### Non-Cluster Mode - Replication Group

```mermaid
graph TD
    A[Application Layer] --> B[Load Balancer<br/>Application Level Routing]
    B --> C[Replication Group]
    
    subgraph C [Replication Group]
        D[Primary Node<br/>Handles Writes]
        E[Replica 1 Node<br/>Read Only]
        F[Replica 2 Node<br/>Read Only]
        
        D -.->|Async Replication| E
        D -.->|Async Replication| F
    end
    
    G[Writes] --> D
    H[Reads] --> E
    H --> F
    
    style A fill:#e1f5fe
    style D fill:#ffecb3
    style E fill:#e8f5e8
    style F fill:#e8f5e8
```

**Characteristics:**
- Single primary handles all writes
- Up to 5 replica nodes
- Manual sharding required for scaling writes
- Simpler configuration and management

### Cluster Mode

```mermaid
graph TD
    A[Application Layer] --> B[Configuration Endpoint<br/>Auto-discovery & Routing]
    B --> C[Redis Cluster]
    
    subgraph C [Redis Cluster]
        subgraph D [Node Group 1<br/>Slots 0-5460]
            D1[Primary 1]
            D2[Replica 1.1]
            D1 -.-> D2
        end
        
        subgraph E [Node Group 2<br/>Slots 5461-10922]
            E1[Primary 2]
            E2[Replica 2.1]
            E1 -.-> E2
        end
        
        subgraph F [Node Group 3<br/>Slots 10923-16383]
            F1[Primary 3]
            F2[Replica 3.1]
            F1 -.-> F2
        end
    end
    
    style A fill:#e1f5fe
    style D1 fill:#ffecb3
    style E1 fill:#ffecb3
    style F1 fill:#ffecb3
    style D2 fill:#e8f5e8
    style E2 fill:#e8f5e8
    style F2 fill:#e8f5e8
```

**Characteristics:**
- Multiple primaries handle writes
- Automatic data sharding across nodes
- Horizontal scaling capability
- Built-in high availability
- Up to 500 nodes total

---

## Replication and High Availability

### Data Flow in Replication

```mermaid
sequenceDiagram
    participant Client
    participant Primary as Redis Primary
    participant R1 as Replica 1
    participant R2 as Replica 2
    
    Client->>Primary: SET key=value
    Primary->>Primary: 1. Write to memory
    Primary->>Primary: 2. Log to AOF
    Primary->>Client: 3. Acknowledge
    
    Note over Primary,R2: Async Replication
    Primary-->>R1: Replicate data
    Primary-->>R2: Replicate data
    
    R1->>R1: Apply changes
    R2->>R2: Apply changes
```

### Automatic Failover Process

```mermaid
graph TD
    subgraph "Normal Operation"
        A[Primary Active] --> B[Replica 1 Standby]
        A --> C[Replica 2 Standby]
    end
    
    subgraph "Primary Failure Detected"
        D[Primary Failed] 
        E[Replica 1 Promoting]
        F[Replica 2 Standby]
    end
    
    subgraph "After Failover"
        G[Old Primary Recovering] --> H[New Primary Active]
        H --> I[Replica 2 Standby]
    end
    
    style A fill:#4caf50
    style D fill:#f44336
    style E fill:#ff9800
    style H fill:#4caf50
```

**Failover Steps:**
1. Health check failure detected
2. Replica with lowest replication lag selected
3. Replica promoted to primary
4. DNS endpoint updated
5. Applications reconnect automatically
6. Old primary becomes replica when recovered

---

## Scaling Strategies

### Vertical Scaling - Scale Up

```mermaid
graph TD
    subgraph "Before Scaling"
        A[t3.micro<br/>1 vCPU, 1GB RAM]
        subgraph A1 [Redis Instance]
            A2[Memory Usage: 80%<br/>CPU Usage: 70%<br/>Network: 50Mbps]
        end
    end
    
    A --> B[Scale Up]
    
    subgraph "After Scaling"
        C[t3.large<br/>2 vCPU, 8GB RAM]
        subgraph C1 [Redis Instance]
            C2[Memory Usage: 20%<br/>CPU Usage: 15%<br/>Network: 125Mbps]
        end
    end
    
    style A fill:#ffcdd2
    style C fill:#c8e6c9
```

**Benefits:** ✓ Higher performance per node, ✓ More memory for caching  
**Limits:** ✗ Single point of failure, ✗ Upper limit on instance size

### Horizontal Scaling - Read Replicas

```mermaid
graph TD
    A[Initial Setup] --> B[Primary Node<br/>All Traffic]
    
    C[Adding Read Replicas] --> D[Write Traffic]
    D --> E[Primary Node]
    
    E -.->|Replication| F[Replica 1 Node]
    E -.->|Replication| G[Replica 2 Node]
    E -.->|Replication| H[Replica 3 Node]
    
    I[Read Traffic] --> F
    I --> G
    I --> H
    I --> E
    
    style E fill:#ffecb3
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#e8f5e8
```

**Traffic Distribution:**
- Primary: 100% writes + 25% reads
- Each Replica: 25% reads
- Total read capacity: 4x improvement

### Horizontal Scaling - Cluster Mode Evolution

```mermaid
graph TD
    subgraph "Step 1: Single Replication Group"
        A[Primary<br/>16,384 Hash Slots<br/>All Data 100%] -.-> B[Replica 1<br/>16,384 Hash Slots]
    end
    
    subgraph "Step 2: Migrate to 2-Node Cluster"
        C[Primary 1<br/>Slots: 0-8191<br/>50% Data] -.-> D[Replica 1.1]
        E[Primary 2<br/>Slots: 8192-16383<br/>50% Data] -.-> F[Replica 2.1]
    end
    
    subgraph "Step 3: Scale to 4-Node Cluster"
        G[Primary 1<br/>Slots: 0-4095<br/>25% Data]
        H[Primary 2<br/>Slots: 4096-8191<br/>25% Data]
        I[Primary 3<br/>Slots: 8192-12287<br/>25% Data]
        J[Primary 4<br/>Slots: 12288-16383<br/>25% Data]
    end
    
    style A fill:#ffecb3
    style C fill:#ffecb3
    style E fill:#ffecb3
    style G fill:#ffecb3
    style H fill:#ffecb3
    style I fill:#ffecb3
    style J fill:#ffecb3
```

**Benefits:**
- Write capacity scales linearly
- Data automatically redistributed
- No single point of failure
- Supports up to 500 nodes

### Scaling Decision Matrix

| Traffic Type | Recommended Scaling | Architecture |
|--------------|-------------------|--------------|
| Read Heavy (80% Read) | Add Read Replicas | Primary + Multiple Replicas |
| Write Heavy (60%+ Write) | Enable Cluster Mode | Multiple Primary Nodes |
| Memory Limited (High Hit Rate) | Vertical Scale or Cluster | Larger Instance Types |
| High Throughput (Mixed Load) | Cluster Mode + Read Replicas | Multiple Nodes + Replicas |

---

## Handling Heavy Traffic

### Redis Connection Limits and Traffic Handling

#### Connection Limits by Instance Type
| Instance Type | Max Connections | Memory | Typical Use Case |
|---------------|----------------|---------|------------------|
| t3.micro | 2,500 | 0.5 GB | Development |
| t3.small | 2,500 | 1.5 GB | Small apps |
| r6g.large | 65,000 | 13 GB | Production |
| r6g.xlarge | 65,000 | 26 GB | High traffic |
| r6g.2xlarge | 65,000 | 52 GB | Enterprise |

### Connection Management Strategy

```mermaid
graph TD
    subgraph "Without Connection Pooling"
        A[Application]
        B[Thread 1] --> A
        C[Thread 2] --> A
        D[Thread 3] --> A
        E[Thread 4] --> A
        F[Thread 5] --> A
        G[Thread N] --> A
        A -->|N connections| H[Redis Cluster<br/>Connection Limit<br/>Exhaustion]
    end
    
    subgraph "With Connection Pooling"
        I[Application]
        J[Thread 1] --> K[Connection Pool<br/>Fixed Size: 10]
        L[Thread 2] --> K
        M[Thread 3] --> K
        N[Thread 4] --> K
        O[Thread 5] --> K
        P[Thread N] --> K
        K --> I
        I -->|10 connections max| Q[Redis Cluster<br/>Efficient<br/>Utilization]
    end
    
    style H fill:#ffcdd2
    style Q fill:#c8e6c9
```

### Handling Traffic Beyond Connection Limits

#### 1. Connection Pooling Strategy
```mermaid
graph TD
    A[10,000 Concurrent Users] --> B[Application Servers]
    B --> C[Connection Pool Manager]
    
    subgraph C [Connection Pool]
        D[Pool Size: 50 connections]
        E[Queue: Waiting requests]
        F[Timeout: 5 seconds]
    end
    
    C --> G[Redis<br/>Max 65,000 connections<br/>Only using 50]
    
    style A fill:#ffeb3b
    style G fill:#4caf50
```

#### 2. Request Queuing and Throttling
```mermaid
flowchart TD
    A[Incoming Request] --> B{Connection Available?}
    B -->|Yes| C[Process Immediately]
    B -->|No| D{Queue Full?}
    D -->|No| E[Add to Queue<br/>Wait for connection]
    D -->|Yes| F[Return 503<br/>Service Unavailable]
    
    E --> G{Timeout Reached?}
    G -->|No| H[Connection Available<br/>Process Request]
    G -->|Yes| I[Return Timeout Error]
    
    style C fill:#4caf50
    style F fill:#f44336
    style I fill:#ff9800
```

#### 3. Load Balancing Across Multiple Nodes
```mermaid
graph TD
    A[High Traffic<br/>100,000 RPS] --> B[Load Balancer]
    
    B --> C[App Server 1<br/>Pool: 20 connections]
    B --> D[App Server 2<br/>Pool: 20 connections]
    B --> E[App Server 3<br/>Pool: 20 connections]
    B --> F[App Server N<br/>Pool: 20 connections]
    
    C --> G[Redis Node 1]
    D --> H[Redis Node 2]
    E --> I[Redis Node 3]
    F --> J[Redis Node N]
    
    style A fill:#ffeb3b
    style G fill:#4caf50
    style H fill:#4caf50
    style I fill:#4caf50
    style J fill:#4caf50
```

**Benefits:**
- ✓ Reduced connection overhead
- ✓ Better resource utilization
- ✓ Connection reuse
- ✓ Controlled resource usage
- ✓ Graceful degradation under load
- ✓ Protection against connection exhaustion

### What Happens When Traffic Exceeds Limits?

#### Scenario 1: Connection Exhaustion
```mermaid
sequenceDiagram
    participant C as Client
    participant A as Application
    participant R as Redis
    
    Note over R: Max connections: 65,000<br/>Current: 64,999
    
    C->>A: New Request
    A->>R: Attempt connection
    R-->>A: Connection refused
    A-->>C: Error: Connection timeout
    
    Note over A: Without proper handling:<br/>- Request fails<br/>- User sees error<br/>- Poor experience
```

#### Scenario 2: With Proper Connection Handling
```mermaid
sequenceDiagram
    participant C as Client
    participant A as Application
    participant P as Pool
    participant R as Redis
    
    C->>A: New Request
    A->>P: Request connection
    
    alt Connection Available
        P->>A: Return connection
        A->>R: Execute command
        R-->>A: Response
        A->>P: Return connection to pool
        A-->>C: Success response
    else Pool Exhausted
        P->>A: Queue request
        Note over P: Wait for available connection<br/>or timeout after 5s
        alt Connection becomes available
            P->>A: Connection available
            A->>R: Execute command
            A-->>C: Success response
        else Timeout
            A-->>C: 503 Service Temporarily Unavailable
        end
    end
```

### Advanced Traffic Handling Strategies

#### 1. Circuit Breaker with Fallback
```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open : Connection failures > 50%
    Open --> HalfOpen : Timer expires (30s)
    HalfOpen --> Closed : Success rate > 95%
    HalfOpen --> Open : Failure detected
    
    Closed : Normal Operation<br/>All requests to Redis
    Open : Circuit Open<br/>Route to fallback cache
    HalfOpen : Testing Recovery<br/>Limited Redis traffic
```

#### 2. Multi-Tier Caching Strategy
```mermaid
graph TD
    A[High Traffic Request] --> B{L1 Cache Hit?}
    B -->|Yes| C[Return from Memory<br/>~0.1ms]
    B -->|No| D{Redis Available?}
    D -->|Yes| E[Query Redis<br/>~1-2ms]
    D -->|No| F[Query Database<br/>~50-200ms]
    
    E --> G{Success?}
    G -->|Yes| H[Cache in L1<br/>Return data]
    G -->|No| F
    
    style C fill:#4caf50
    style H fill:#4caf50
    style F fill:#ff9800
```

#### 3. Auto-Scaling Response
```mermaid
graph TD
    A[Traffic Spike Detected] --> B[CloudWatch Metrics]
    B --> C{Connection Usage > 80%?}
    C -->|Yes| D[Trigger Auto-Scaling]
    
    D --> E[Add Read Replicas]
    D --> F[Scale Up Instance Size]
    D --> G[Enable Cluster Mode]
    
    E --> H[Distribute Read Load]
    F --> I[Increase Connection Limit]
    G --> J[Horizontal Write Scaling]
    
    style C fill:#ff9800
    style H fill:#4caf50
    style I fill:#4caf50
    style J fill:#4caf50
```

### Best Practices for High Traffic Scenarios

#### Connection Pool Configuration
| Setting | Small App | Medium App | Large App |
|---------|-----------|------------|-----------|
| Pool Size | 5-10 | 20-50 | 100-200 |
| Max Wait Time | 5s | 3s | 1s |
| Idle Timeout | 300s | 600s | 900s |
| Validation Query | PING | PING | PING |

### Caching Patterns for High Traffic

#### Cache-Aside Pattern

```mermaid
flowchart TD
    A[Application Request] --> B{Check Cache}
    B -->|Cache Hit| C[Return Data]
    B -->|Cache Miss| D[Query Database]
    D --> E[Store in Cache]
    E --> F[Return Data]
    
    G[Application Update] --> H[Update Database]
    H --> I[Evict from Cache]
    
    style C fill:#c8e6c9
    style F fill:#c8e6c9
```

#### Write-Through Pattern

```mermaid
flowchart TD
    A[Application Write] --> B[Write to Cache]
    B --> C[Write to Database]
    C --> D[Confirm Success]
    
    style D fill:#c8e6c9
```

**Benefits:** ✓ Data consistency, ✓ Always fresh data  
**Drawbacks:** ✗ Higher write latency, ✗ Cache may contain unused data

### Geographic Distribution

```mermaid
graph TD
    A[Global Users] --> B[US East Region]
    A --> C[EU West Region]
    
    subgraph B [US East Region]
        D[Redis Cluster<br/>3AZ]
    end
    
    subgraph C [EU West Region]
        E[Redis Cluster<br/>3AZ]
    end
    
    style A fill:#e1f5fe
    style D fill:#ffecb3
    style E fill:#ffecb3
```

**Benefits:**
- ✓ Reduced latency
- ✓ Data locality
- ✓ Fault isolation
- ✓ Compliance requirements

### Performance Optimization Hierarchy

```mermaid
graph TD
    A[Request] --> B[L1 Cache<br/>Application<br/>~1ms]
    B -->|Cache Miss| C[ElastiCache<br/>Redis<br/>~1-5ms]
    C -->|Cache Miss| D[Database<br/>RDS/DDB<br/>~10-100ms]
    
    style B fill:#c8e6c9
    style C fill:#fff3e0
    style D fill:#ffcdd2
```

**Optimization Strategies:**
1. **Batch Operations**
   - MGET for multiple keys
   - Pipeline commands
   - Reduce network round trips

2. **Data Structure Selection**
   - Hash for objects
   - Sets for unique collections
   - Sorted sets for rankings
   - Lists for queues

3. **TTL Management**
   - Set appropriate expiration
   - Avoid thundering herd
   - Use jitter for staggered expiry

### Circuit Breaker Pattern for Resilience

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open : Failure Rate > 50%
    Open --> HalfOpen : Timer Expires
    HalfOpen --> Closed : Success Rate > 95%
    HalfOpen --> Open : Failure Detected
    
    Closed : Normal Operation<br/>Success Rate > 95%
    Open : Failures Detected<br/>Route to Fallback
    HalfOpen : Testing Recovery<br/>Limited Traffic
```

---

## Real-World Examples

### Example 1: E-commerce Platform Scaling Journey

#### Phase 1: Small Store - 0-1K users

```mermaid
graph TD
    A[Web Application] --> B[Single Redis Node<br/>cache.t3.micro<br/>1 vCPU, 0.5GB<br/><br/>Use Cases:<br/>• Session storage<br/>• Product catalog cache<br/>• Shopping cart data]
    
    style A fill:#e1f5fe
    style B fill:#fff3e0
```

**Cost:** ~$15/month  
**Performance:** Handles 10-50 RPS

#### Phase 2: Growing Business - 1K-10K users

```mermaid
graph TD
    A[Web Application] --> B[Writes]
    A --> C[Reads]
    
    B --> D[Primary<br/>cache.t3.small<br/>2vCPU, 1.5GB]
    C --> E[Replica<br/>cache.t3.small<br/>2vCPU, 1.5GB]
    
    D -.->|Replication| E
    
    style A fill:#e1f5fe
    style D fill:#ffecb3
    style E fill:#e8f5e8
```

**Cost:** ~$60/month  
**Performance:** Handles 100-500 RPS  
**Benefits:**
- Read scaling
- High availability
- Zero-downtime deployments

#### Phase 3: High-Traffic Platform - 10K-100K users

```mermaid
graph TD
    A[Load Balanced Web Applications] --> B[Redis Cluster - Cluster Mode Enabled]
    
    subgraph B [Redis Cluster]
        subgraph C [Node Group 1]
            C1[Primary 1<br/>cache.r6g.lg<br/>2vCPU, 13GB]
            C2[Replica 1.1<br/>cache.r6g.lg]
            C1 -.-> C2
        end
        
        subgraph D [Node Group 2]
            D1[Primary 2<br/>cache.r6g.lg<br/>2vCPU, 13GB]
            D2[Replica 2.1<br/>cache.r6g.lg]
            D1 -.-> D2
        end
        
        subgraph E [Node Group 3]
            E1[Primary 3<br/>cache.r6g.lg<br/>2vCPU, 13GB]
            E2[Replica 3.1<br/>cache.r6g.lg]
            E1 -.-> E2
        end
    end
    
    style A fill:#e1f5fe
    style C1 fill:#ffecb3
    style D1 fill:#ffecb3
    style E1 fill:#ffecb3
    style C2 fill:#e8f5e8
    style D2 fill:#e8f5e8
    style E2 fill:#e8f5e8
```

**Cost:** ~$800/month  
**Performance:** Handles 1K-10K RPS  
**Benefits:**
- Linear write scaling
- 78GB total memory
- Automatic sharding
- Multi-AZ deployment

### Example 2: Real-time Gaming Platform

#### Game Architecture with Redis Operations

```mermaid
graph TD
    A[Game Client] --> B[Game Server]
    
    B --> C[Redis Cluster Setup]
    
    subgraph C [Redis Operations]
        subgraph D [Node Group 1 - Session Data]
            D1[Primary 1<br/>+ 2 Replicas]
        end
        
        subgraph E [Node Group 2 - Game State]
            E1[Primary 2<br/>+ 2 Replicas]
        end
        
        subgraph F [Node Group 3 - Leaderboards]
            F1[Primary 3<br/>+ 2 Replicas]
        end
    end
    
    G[Redis Data Types:<br/>• Player Sessions - Hash<br/>• Leaderboards - Sorted Set<br/>• Real-time Chat - List<br/>• Game State - String<br/>• Pub/Sub - Notifications]
    
    style A fill:#e1f5fe
    style B fill:#fff3e0
    style D1 fill:#ffecb3
    style E1 fill:#ffecb3
    style F1 fill:#ffecb3
```

**Performance Requirements:**
- < 1ms latency for session lookups
- Handle 50K concurrent players
- Real-time leaderboard updates
- 99.99% availability

### Example 3: Social Media Platform Multi-Level Caching

```mermaid
graph TD
    A[User Request] --> B[CDN Cache<br/>Static Content - 24h TTL]
    B -->|Dynamic Content| C[Application Server]
    
    C --> D[L1 Cache Local<br/>Response Time: ~0.1ms<br/>TTL: 30 seconds]
    D -->|Cache Miss| E[ElastiCache Redis<br/>Response Time: ~1-2ms<br/>TTL: 5 minutes]
    E -->|Cache Miss| F[Database<br/>Response Time: ~50-200ms]
    
    G[Redis Data Types:<br/>• User profiles - Hash<br/>• Friend lists - Set<br/>• Timeline cache - List<br/>• Trending topics - Sorted Set<br/>• Session data - String]
    
    style A fill:#e1f5fe
    style D fill:#c8e6c9
    style E fill:#fff3e0
    style F fill:#ffcdd2
```

**Cache Hit Rates:**
- L1 Cache: 85% hit rate
- Redis Cache: 12% hit rate  
- Database: 3% hit rate

**Performance Impact:**
- Average response time: ~5ms
- 97% reduction in database load
- Support for 1M+ concurrent users

### Example 4: Financial Services - High Availability Multi-Region Setup

```mermaid
graph TD
    subgraph A [Primary Region - US-East-1]
        subgraph B [AZ-1a]
            C[Primary Node<br/>Transaction Data]
        end
        
        subgraph D [AZ-1b]
            E[Replica Node<br/>Synchronous Rep]
        end
        
        C -.->|Sync Replication| E
    end
    
    A -.->|Cross-Region Replication| F
    
    subgraph F [Disaster Recovery - US-West-2]
        subgraph G [AZ-2a]
            H[Standby Node<br/>Asynchronous Rep]
        end
    end
    
    style C fill:#4caf50
    style E fill:#2196f3
    style H fill:#ff9800
```

**Regulatory Requirements:**
- Zero data loss tolerance
- 99.999% availability (5.26 min downtime/year)
- Disaster recovery within 15 minutes
- Data encryption at rest and in transit
- Audit logging for all operations

**Failover Strategy:**
1. Health check failure detected (< 30 seconds)
2. Automatic failover to AZ-1b replica (< 60 seconds)
3. If entire region fails, manual promotion of DR site (< 15 minutes)
4. Data consistency verification before resuming operations

---

## Best Practices Summary

### When to Use Different Configurations

#### Single Node - Development/Testing

**Suitable for:**
- ✓ Development environments
- ✓ Proof of concepts
- ✓ Applications with < 1K users
- ✓ Non-critical workloads

**Example Use Cases:**
- User session storage
- Simple caching layer
- Development testing

#### Primary + Replicas - Production Ready

**Suitable for:**
- ✓ Production applications
- ✓ Read-heavy workloads
- ✓ Applications requiring high availability
- ✓ 1K - 50K users

**Example Use Cases:**
- E-commerce product catalogs
- Content management systems
- Social media feeds
- Gaming leaderboards

#### Cluster Mode - Enterprise Scale

**Suitable for:**
- ✓ Large-scale applications
- ✓ Write-heavy workloads
- ✓ Applications with > 50K users
- ✓ Mission-critical systems

**Example Use Cases:**
- Real-time analytics
- High-frequency trading
- Massive multiplayer games
- IoT data processing

### Performance Tuning Guidelines

**Memory Optimization:**
1. **Use appropriate data types**
   - Hash for objects (more memory efficient than JSON strings)
   - Sets for unique collections
   - Sorted sets for rankings

2. **Set TTL appropriately**
   - Short TTL for frequently changing data (1-5 minutes)
   - Long TTL for relatively static data (1-24 hours)
   - Use EXPIRE command strategically

3. **Monitor memory usage**
   - Keep below 80% capacity
   - Use memory optimization commands
   - Regular cleanup of expired keys

**Network Optimization:**
1. Use pipelining for batch operations
2. Minimize network round trips
3. Use connection pooling
4. Implement retry logic with exponential backoff

**Monitoring and Alerting:**
1. **Key Metrics to Monitor:**
   - CPU utilization (< 80%)
   - Memory utilization (< 80%)
   - Network throughput
   - Cache hit ratio (> 80%)
   - Connection count
   - Latency (< 1ms for most operations)

2. **Set up alerts for:**
   - High memory usage
   - Failover events
   - Slow queries
   - Connection limit approach

This comprehensive guide covers all the essential aspects of ElastiCache Redis, from basic terminology to advanced scaling strategies. The visual diagrams and real-world examples should help you understand how to implement and scale Redis effectively based on your specific use case and traffic patterns.
