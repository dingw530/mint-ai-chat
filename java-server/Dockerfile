FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 mint \
    && mkdir -p /data /workspace \
    && chown -R mint:mint /data /workspace
WORKDIR /app
COPY --from=build /build/target/mint-java-server-*.jar /app/mint-java-server.jar
USER mint
EXPOSE 3002
ENTRYPOINT ["java", "-jar", "/app/mint-java-server.jar"]
